-- Iteration 185: a secret chat is a separate conversation request.
-- The recipient can accept it on their next login; ordinary chats stay untouched.
create table if not exists public.rim_secret_chat_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  constraint rim_secret_chat_requests_distinct_users check (requester_id <> recipient_id)
);

create unique index if not exists rim_secret_chat_requests_one_pending_pair
  on public.rim_secret_chat_requests (
    least(requester_id::text, recipient_id::text),
    greatest(requester_id::text, recipient_id::text)
  )
  where status = 'pending';

create index if not exists rim_secret_chat_requests_recipient_pending
  on public.rim_secret_chat_requests (recipient_id, created_at)
  where status = 'pending';

alter table public.rim_secret_chat_requests enable row level security;
drop policy if exists rim_secret_chat_requests_select_participant on public.rim_secret_chat_requests;
create policy rim_secret_chat_requests_select_participant
  on public.rim_secret_chat_requests
  for select to authenticated
  using (requester_id = auth.uid() or recipient_id = auth.uid());

revoke all on public.rim_secret_chat_requests from anon, authenticated;
grant select on public.rim_secret_chat_requests to authenticated;

-- A one-transaction capability record lets only the reviewed SECURITY DEFINER
-- RPCs pass the E2E activation trigger. Clients cannot write this private table.
create table if not exists private.rim_e2e_activation_authorizations (
  scope_type text not null check (scope_type in ('direct','group','private_channel')),
  scope_id uuid not null,
  authorized_user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid references public.rim_secret_chat_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (scope_type, scope_id)
);
revoke all on private.rim_e2e_activation_authorizations from public, anon, authenticated;

create or replace function private.rim_guard_e2e_activation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_scope_type text;
  v_authorized boolean := false;
begin
  if new.e2e_mode = 'required' and coalesce(old.e2e_mode, 'off') <> 'required'
     and auth.role() <> 'service_role' then
    v_scope_type := case when tg_table_name = 'channels' then 'private_channel' else new.type end;
    select exists (
      select 1
      from private.rim_e2e_activation_authorizations a
      where a.scope_type = v_scope_type
        and a.scope_id = new.id
        and a.authorized_user_id = auth.uid()
        and (
          (a.request_id is null and v_scope_type in ('group','private_channel'))
          or exists (
            select 1 from public.rim_secret_chat_requests r
            where r.id = a.request_id
              and r.conversation_id = new.id
              and r.recipient_id = auth.uid()
              and r.status = 'pending'
          )
        )
    ) into v_authorized;
    if not v_authorized then
      raise exception 'e2e_activation_requires_trusted_deployment' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.rim_create_secret_direct_chat(p_other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user uuid := auth.uid();
  v_conversation uuid;
  v_pair_key text;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_other_user is null or p_other_user = v_user then raise exception 'invalid_secret_chat_peer' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_other_user) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_user and b.blocked_id = p_other_user)
       or (b.blocker_id = p_other_user and b.blocked_id = v_user)
  ) then raise exception 'user_blocked' using errcode = '42501'; end if;

  v_pair_key := least(v_user::text, p_other_user::text) || ':' || greatest(v_user::text, p_other_user::text);
  perform pg_advisory_xact_lock(hashtextextended(v_pair_key, 0));

  -- Reuse an already accepted secret chat for this exact two-person pair.
  select c.id into v_conversation
  from public.conversations c
  where c.type = 'direct' and c.is_secret is true and c.e2e_mode = 'required'
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = v_user)
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = p_other_user)
    and (select count(*) from public.conversation_members m where m.conversation_id = c.id) = 2
  order by c.created_at desc limit 1;
  if v_conversation is not null then return v_conversation; end if;

  -- A request in either direction is already sufficient; do not create duplicates.
  select r.conversation_id into v_conversation
  from public.rim_secret_chat_requests r
  where r.status = 'pending'
    and ((r.requester_id = v_user and r.recipient_id = p_other_user)
      or (r.requester_id = p_other_user and r.recipient_id = v_user))
  order by r.created_at desc limit 1;
  if v_conversation is not null then return v_conversation; end if;

  -- This is deliberately NOT secret/required yet. The recipient must accept
  -- the durable request before the scope can become E2E-required.
  insert into public.conversations (
    type, created_by, title, is_private, is_secret, e2e_mode, e2e_epoch, e2e_protocol
  ) values (
    'direct', v_user, null, true, false, 'pending', 1, 'OPEN-E2EE-SP1'
  ) returning id into v_conversation;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conversation, v_user), (v_conversation, p_other_user)
  on conflict do nothing;

  insert into public.rim_secret_chat_requests (conversation_id, requester_id, recipient_id)
  values (v_conversation, v_user, p_other_user);

  return v_conversation;
end;
$function$;

create or replace function public.rim_accept_secret_chat_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user uuid := auth.uid();
  v_request public.rim_secret_chat_requests%rowtype;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into v_request
  from public.rim_secret_chat_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'secret_chat_request_not_found' using errcode = 'P0002'; end if;
  if v_request.recipient_id <> v_user then raise exception 'not_secret_chat_recipient' using errcode = '42501'; end if;
  if v_request.status = 'accepted' then return v_request.conversation_id; end if;
  if v_request.status <> 'pending' then raise exception 'secret_chat_request_closed' using errcode = '55000'; end if;

  if not exists (
    select 1 from public.conversation_members m
    where m.conversation_id = v_request.conversation_id and m.user_id = v_request.requester_id
  ) or not exists (
    select 1 from public.conversation_members m
    where m.conversation_id = v_request.conversation_id and m.user_id = v_request.recipient_id
  ) then raise exception 'secret_chat_membership_invalid' using errcode = '42501'; end if;

  insert into private.rim_e2e_activation_authorizations (scope_type, scope_id, authorized_user_id, request_id)
  values ('direct', v_request.conversation_id, v_user, p_request_id)
  on conflict (scope_type, scope_id) do update
    set authorized_user_id = excluded.authorized_user_id,
        request_id = excluded.request_id,
        created_at = now();

  update public.conversations
  set is_secret = true,
      e2e_mode = 'required',
      e2e_epoch = greatest(coalesce(e2e_epoch, 0), 1),
      e2e_protocol = 'OPEN-E2EE-SP1'
  where id = v_request.conversation_id and type = 'direct';
  if not found then raise exception 'secret_chat_conversation_missing' using errcode = 'P0002'; end if;

  delete from private.rim_e2e_activation_authorizations
  where scope_type = 'direct' and scope_id = v_request.conversation_id;

  update public.rim_secret_chat_requests
  set status = 'accepted', accepted_at = now(), updated_at = now()
  where id = p_request_id;

  return v_request.conversation_id;
end;
$function$;

create or replace function public.rim_cancel_secret_chat_request(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user uuid := auth.uid();
  v_request public.rim_secret_chat_requests%rowtype;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into v_request
  from public.rim_secret_chat_requests
  where conversation_id = p_conversation_id and status = 'pending'
  for update;
  if not found then raise exception 'secret_chat_request_not_pending' using errcode = 'P0002'; end if;
  if v_request.requester_id <> v_user then raise exception 'not_secret_chat_requester' using errcode = '42501'; end if;

  update public.conversations
  set is_secret = false, e2e_mode = 'off'
  where id = v_request.conversation_id and type = 'direct';

  update public.rim_secret_chat_requests
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = v_request.id;
  return true;
end;
$function$;

create or replace function public.rim_disable_e2e_scope(p_scope_type text, p_scope_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user uuid := auth.uid();
  v_manager boolean := false;
  v_epoch bigint := 0;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_scope_id is null or p_scope_type not in ('group','private_channel') then
    raise exception 'invalid_e2e_scope' using errcode = '22023';
  end if;

  if p_scope_type = 'group' then
    select (c.created_by = v_user or exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = v_user and m.role in ('owner','admin')
    )), c.e2e_epoch
    into v_manager, v_epoch
    from public.conversations c
    where c.id = p_scope_id and c.type = 'group' and c.is_private is true;
    if not found or not v_manager then raise exception 'e2e_disable_requires_private_group_manager' using errcode = '42501'; end if;
    update public.conversations
    set e2e_mode = 'off', e2e_protocol = null, e2e_epoch = coalesce(e2e_epoch,0) + 1
    where id = p_scope_id returning e2e_epoch into v_epoch;
  else
    select (c.owner_id = v_user or exists (
      select 1 from public.channel_members m
      where m.channel_id = c.id and m.user_id = v_user and m.role in ('owner','admin','moderator')
    )), c.e2e_epoch
    into v_manager, v_epoch
    from public.channels c where c.id = p_scope_id and c.is_public is false;
    if not found or not v_manager then raise exception 'e2e_disable_requires_private_channel_manager' using errcode = '42501'; end if;
    update public.channels
    set e2e_mode = 'off', e2e_protocol = null, e2e_epoch = coalesce(e2e_epoch,0) + 1
    where id = p_scope_id returning e2e_epoch into v_epoch;
  end if;

  return jsonb_build_object('scope_type',p_scope_type,'scope_id',p_scope_id,'mode','off','epoch',v_epoch);
end;
$function$;

create or replace function public.rim_decline_secret_chat_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user uuid := auth.uid();
  v_request public.rim_secret_chat_requests%rowtype;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into v_request
  from public.rim_secret_chat_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'secret_chat_request_not_found' using errcode = 'P0002'; end if;
  if v_request.recipient_id <> v_user then raise exception 'not_secret_chat_recipient' using errcode = '42501'; end if;
  if v_request.status = 'declined' then return true; end if;
  if v_request.status <> 'pending' then raise exception 'secret_chat_request_closed' using errcode = '55000'; end if;

  -- Declining cancels only the E2E proposal; the newly-created conversation
  -- becomes an ordinary direct chat and neither user's other chats are changed.
  update public.conversations
  set is_secret = false, e2e_mode = 'off'
  where id = v_request.conversation_id and type = 'direct';

  update public.rim_secret_chat_requests
  set status = 'declined', declined_at = now(), updated_at = now()
  where id = p_request_id;
  return true;
end;
$function$;

revoke all on function public.rim_create_secret_direct_chat(uuid) from public, anon;
revoke all on function public.rim_accept_secret_chat_request(uuid) from public, anon;
revoke all on function public.rim_decline_secret_chat_request(uuid) from public, anon;
grant execute on function public.rim_create_secret_direct_chat(uuid) to authenticated;
grant execute on function public.rim_accept_secret_chat_request(uuid) to authenticated;
grant execute on function public.rim_decline_secret_chat_request(uuid) to authenticated;
revoke all on function public.rim_cancel_secret_chat_request(uuid) from public, anon;
revoke all on function public.rim_disable_e2e_scope(text,uuid) from public, anon;
grant execute on function public.rim_cancel_secret_chat_request(uuid) to authenticated;
grant execute on function public.rim_disable_e2e_scope(text,uuid) to authenticated;

create or replace function public.rim_e2e_activate_scope(p_scope_type text, p_scope_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, private
as $function$
declare
  v_user uuid := auth.uid();
  v_total integer := 0;
  v_ready integer := 0;
  v_manager boolean := false;
  v_epoch bigint := 0;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_scope_id is null or p_scope_type not in ('group','private_channel') then
    raise exception 'invalid_e2e_scope' using errcode = '22023';
  end if;

  if p_scope_type = 'group' then
    if not exists (select 1 from public.conversation_members where conversation_id = p_scope_id and user_id = v_user) then
      raise exception 'conversation_access_denied' using errcode = '42501';
    end if;
    select (c.created_by = v_user or exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = v_user and m.role in ('owner','admin')
    )), c.e2e_epoch
    into v_manager, v_epoch
    from public.conversations c
    where c.id = p_scope_id and c.type = 'group' and c.is_private is true;
    if not found or not v_manager then raise exception 'e2e_requires_private_group_manager' using errcode = '42501'; end if;

    select count(distinct user_id) into v_total
    from public.conversation_members where conversation_id = p_scope_id;
    select count(distinct m.user_id) into v_ready
    from public.conversation_members m
    where m.conversation_id = p_scope_id
      and exists (
        select 1 from public.rim_e2e_relay_devices d
        where d.user_id = m.user_id and d.status = 'active' and d.registered = true
          and d.enabled = true and d.protocol_profile = 'OPEN-E2EE-SP1'
      );
    if v_total < 2 or v_ready <> v_total then
      raise exception 'e2e_members_missing_devices:%/%', v_ready, v_total using errcode = '42501';
    end if;

    insert into private.rim_e2e_activation_authorizations(scope_type,scope_id,authorized_user_id)
    values ('group',p_scope_id,v_user)
    on conflict (scope_type,scope_id) do update
      set authorized_user_id = excluded.authorized_user_id, request_id = null, created_at = now();
    update public.conversations
    set e2e_mode = 'required', e2e_protocol = 'OPEN-E2EE-SP1', e2e_epoch = coalesce(e2e_epoch,0) + 1
    where id = p_scope_id returning e2e_epoch into v_epoch;
    delete from private.rim_e2e_activation_authorizations where scope_type = 'group' and scope_id = p_scope_id;
  else
    if not exists (select 1 from public.channel_members where channel_id = p_scope_id and user_id = v_user) then
      raise exception 'channel_access_denied' using errcode = '42501';
    end if;
    select (c.owner_id = v_user or exists (
      select 1 from public.channel_members m
      where m.channel_id = c.id and m.user_id = v_user and m.role in ('owner','admin','moderator')
    )), c.e2e_epoch
    into v_manager, v_epoch
    from public.channels c where c.id = p_scope_id and c.is_public is false;
    if not found or not v_manager then raise exception 'e2e_requires_private_channel_manager' using errcode = '42501'; end if;

    select count(distinct user_id) into v_total
    from public.channel_members where channel_id = p_scope_id;
    select count(distinct m.user_id) into v_ready
    from public.channel_members m
    where m.channel_id = p_scope_id
      and exists (
        select 1 from public.rim_e2e_relay_devices d
        where d.user_id = m.user_id and d.status = 'active' and d.registered = true
          and d.enabled = true and d.protocol_profile = 'OPEN-E2EE-SP1'
      );
    if v_total < 2 or v_ready <> v_total then
      raise exception 'e2e_members_missing_devices:%/%', v_ready, v_total using errcode = '42501';
    end if;

    insert into private.rim_e2e_activation_authorizations(scope_type,scope_id,authorized_user_id)
    values ('private_channel',p_scope_id,v_user)
    on conflict (scope_type,scope_id) do update
      set authorized_user_id = excluded.authorized_user_id, request_id = null, created_at = now();
    update public.channels
    set e2e_mode = 'required', e2e_protocol = 'OPEN-E2EE-SP1', e2e_epoch = coalesce(e2e_epoch,0) + 1
    where id = p_scope_id returning e2e_epoch into v_epoch;
    delete from private.rim_e2e_activation_authorizations where scope_type = 'private_channel' and scope_id = p_scope_id;
  end if;

  return jsonb_build_object(
    'scope_type', p_scope_type, 'scope_id', p_scope_id, 'mode', 'required',
    'epoch', v_epoch, 'members_total', v_total, 'members_ready', v_ready, 'ready', true
  );
end;
$function$;

do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'rim_secret_chat_requests'
     ) then
    alter publication supabase_realtime add table public.rim_secret_chat_requests;
  end if;
end;
$publication$;
