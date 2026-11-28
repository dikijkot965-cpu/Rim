-- Iteration 185 hardening: recipient-controlled direct invitations,
-- cancellable pending invitations, per-scope E2E disable, and a one-use
-- authorization capability for manager-approved group/channel activation.

create table if not exists private.rim_e2e_activation_authorizations (
  scope_type text not null check (scope_type in ('group','private_channel')),
  scope_id uuid not null,
  authorized_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (scope_type, scope_id)
);
revoke all on private.rim_e2e_activation_authorizations from public, anon, authenticated;

create or replace function private.rim_guard_e2e_activation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_scope_type text;
  v_authorized boolean := false;
begin
  if new.e2e_mode = 'required'
     and coalesce(old.e2e_mode, 'off') <> 'required'
     and auth.role() <> 'service_role' then
    v_scope_type := case when tg_table_name = 'channels' then 'private_channel' else new.type end;
    select exists (
      select 1
      from private.rim_e2e_activation_authorizations a
      where a.scope_type = v_scope_type
        and a.scope_id = new.id
        and a.authorized_user_id = auth.uid()
    ) into v_authorized;
    if not v_authorized then
      raise exception 'e2e_activation_requires_trusted_deployment' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

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
      set authorized_user_id = excluded.authorized_user_id, created_at = now();
    update public.conversations
    set e2e_mode = 'required', e2e_protocol = 'OPEN-E2EE-SP1', e2e_epoch = coalesce(e2e_epoch,0) + 1
    where id = p_scope_id returning e2e_epoch into v_epoch;
    delete from private.rim_e2e_activation_authorizations
    where scope_type = 'group' and scope_id = p_scope_id;
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
      set authorized_user_id = excluded.authorized_user_id, created_at = now();
    update public.channels
    set e2e_mode = 'required', e2e_protocol = 'OPEN-E2EE-SP1', e2e_epoch = coalesce(e2e_epoch,0) + 1
    where id = p_scope_id returning e2e_epoch into v_epoch;
    delete from private.rim_e2e_activation_authorizations
    where scope_type = 'private_channel' and scope_id = p_scope_id;
  end if;

  return jsonb_build_object(
    'scope_type', p_scope_type, 'scope_id', p_scope_id, 'mode', 'required',
    'epoch', v_epoch, 'members_total', v_total, 'members_ready', v_ready, 'ready', true
  );
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
    if not found or not v_manager then raise exception 'e2e_disable_requires_private_group_manager' using errcode = '42501'; end if;
    update public.conversations
    set e2e_mode = 'off', e2e_protocol = null, e2e_epoch = coalesce(e2e_epoch,0) + 1
    where id = p_scope_id returning e2e_epoch into v_epoch;
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
    if not found or not v_manager then raise exception 'e2e_disable_requires_private_channel_manager' using errcode = '42501'; end if;
    update public.channels
    set e2e_mode = 'off', e2e_protocol = null, e2e_epoch = coalesce(e2e_epoch,0) + 1
    where id = p_scope_id returning e2e_epoch into v_epoch;
  end if;

  return jsonb_build_object('scope_type',p_scope_type,'scope_id',p_scope_id,'mode','off','epoch',v_epoch);
end;
$function$;

create or replace function public.rim_e2e_cancel_direct_invitation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user uuid := auth.uid();
  v_creator uuid;
  v_peer uuid;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select c.created_by into v_creator
  from public.conversations c
  where c.id = p_conversation_id and c.type = 'direct'
    and c.is_secret is true and c.e2e_mode = 'required'
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = v_user)
  for update;
  if v_creator is null then raise exception 'direct_e2e_invitation_not_found' using errcode = 'P0002'; end if;
  if v_creator <> v_user then raise exception 'not_direct_e2e_invitation_creator' using errcode = '42501'; end if;

  select m.user_id into v_peer from public.conversation_members m
  where m.conversation_id = p_conversation_id and m.user_id <> v_creator
  order by m.user_id limit 1;
  if v_peer is null or (select count(*) from public.conversation_members m where m.conversation_id = p_conversation_id) <> 2 then
    raise exception 'secret_direct_membership_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from public.rim_e2e_direct_invitation_acceptances a
             where a.conversation_id = p_conversation_id and a.user_id = v_peer) then
    raise exception 'direct_e2e_invitation_already_accepted' using errcode = '55000';
  end if;

  update public.conversations
  set is_secret = false, e2e_mode = 'off', e2e_protocol = null,
      e2e_epoch = coalesce(e2e_epoch,0) + 1
  where id = p_conversation_id;
  return true;
end;
$function$;

create or replace function public.rim_e2e_decline_direct_invitation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user uuid := auth.uid();
  v_creator uuid;
  v_peer uuid;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select c.created_by into v_creator
  from public.conversations c
  where c.id = p_conversation_id and c.type = 'direct'
    and c.is_secret is true and c.e2e_mode = 'required'
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = v_user)
  for update;
  if v_creator is null then raise exception 'direct_e2e_invitation_not_found' using errcode = 'P0002'; end if;
  if v_creator = v_user then raise exception 'invitation_creator_cannot_decline' using errcode = '42501'; end if;

  select m.user_id into v_peer from public.conversation_members m
  where m.conversation_id = p_conversation_id and m.user_id <> v_creator
  order by m.user_id limit 1;
  if v_peer is distinct from v_user
     or (select count(*) from public.conversation_members m where m.conversation_id = p_conversation_id) <> 2 then
    raise exception 'secret_direct_membership_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from public.rim_e2e_direct_invitation_acceptances a
             where a.conversation_id = p_conversation_id and a.user_id = v_user) then
    raise exception 'direct_e2e_invitation_already_accepted' using errcode = '55000';
  end if;

  update public.conversations
  set is_secret = false, e2e_mode = 'off', e2e_protocol = null,
      e2e_epoch = coalesce(e2e_epoch,0) + 1
  where id = p_conversation_id;
  return true;
end;
$function$;

revoke all on function public.rim_disable_e2e_scope(text,uuid) from public, anon;
revoke all on function public.rim_e2e_cancel_direct_invitation(uuid) from public, anon;
revoke all on function public.rim_e2e_decline_direct_invitation(uuid) from public, anon;
grant execute on function public.rim_disable_e2e_scope(text,uuid) to authenticated;
grant execute on function public.rim_e2e_cancel_direct_invitation(uuid) to authenticated;
grant execute on function public.rim_e2e_decline_direct_invitation(uuid) to authenticated;

do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rim_e2e_direct_invitation_acceptances') then
      alter publication supabase_realtime add table public.rim_e2e_direct_invitation_acceptances;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members') then
      alter publication supabase_realtime add table public.conversation_members;
    end if;
  end if;
end;
$publication$;
