-- RIM Iteration 136: E2E scope metadata and encrypted group-key distribution.
-- Additive only. Does NOT activate E2E or change existing message bodies.
-- The application must integrate and verify the ratcheting protocol before
-- any scope can be moved from `pending` to `required`.

alter table public.conversations
  add column if not exists e2e_mode text not null default 'off',
  add column if not exists e2e_epoch bigint not null default 0,
  add column if not exists e2e_protocol text;

alter table public.channels
  add column if not exists e2e_mode text not null default 'off',
  add column if not exists e2e_epoch bigint not null default 0,
  add column if not exists e2e_protocol text;

alter table public.chat_messages
  add column if not exists encryption_version smallint,
  add column if not exists encrypted_payload jsonb;

alter table public.channel_posts
  add column if not exists encryption_version smallint,
  add column if not exists encrypted_payload jsonb;

alter table public.conversations
  drop constraint if exists conversations_e2e_mode_check;
alter table public.conversations
  add constraint conversations_e2e_mode_check
  check (e2e_mode in ('off','pending','required'));
alter table public.conversations
  drop constraint if exists conversations_e2e_private_group_check;
alter table public.conversations
  add constraint conversations_e2e_private_group_check
  check (type <> 'group' or is_private is true or e2e_mode = 'off');

alter table public.channels
  drop constraint if exists channels_e2e_mode_check;
alter table public.channels
  add constraint channels_e2e_mode_check
  check (e2e_mode in ('off','pending','required'));
alter table public.channels
  drop constraint if exists channels_e2e_private_only_check;
alter table public.channels
  add constraint channels_e2e_private_only_check
  check (is_public is false or e2e_mode = 'off');

create table if not exists public.rim_e2e_scope_key_packages (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('direct','group','private_channel')),
  scope_id uuid not null,
  epoch bigint not null check (epoch > 0),
  sender_device_id uuid not null references public.rim_e2e_devices(id) on delete cascade,
  recipient_device_id uuid not null references public.rim_e2e_devices(id) on delete cascade,
  encrypted_package jsonb not null,
  created_at timestamptz not null default now(),
  unique(scope_type,scope_id,epoch,sender_device_id,recipient_device_id),
  check (sender_device_id <> recipient_device_id)
);
create index if not exists rim_e2e_scope_packages_recipient_idx
  on public.rim_e2e_scope_key_packages(recipient_device_id,scope_type,scope_id,epoch desc);

alter table public.rim_e2e_scope_key_packages enable row level security;
revoke all on public.rim_e2e_scope_key_packages from anon,authenticated;
grant select,insert on public.rim_e2e_scope_key_packages to authenticated;

drop policy if exists rim_e2e_scope_packages_member_read on public.rim_e2e_scope_key_packages;
create policy rim_e2e_scope_packages_member_read
on public.rim_e2e_scope_key_packages for select to authenticated
using (
  (scope_type in ('direct','group') and exists (
    select 1 from public.conversation_members cm
    join public.conversations c on c.id=cm.conversation_id
    where cm.conversation_id=scope_id and cm.user_id=(select auth.uid())
      and c.e2e_mode='required' and (c.type='direct' or (c.type='group' and c.is_private is true))
  ))
  or
  (scope_type='private_channel' and exists (
    select 1 from public.channel_members cm
    join public.channels c on c.id=cm.channel_id
    where cm.channel_id=scope_id and cm.user_id=(select auth.uid())
      and c.is_public is false and c.e2e_mode='required'
  ))
);

drop policy if exists rim_e2e_scope_packages_member_insert on public.rim_e2e_scope_key_packages;
create policy rim_e2e_scope_packages_member_insert
on public.rim_e2e_scope_key_packages for insert to authenticated
with check (
  exists (
    select 1 from public.rim_e2e_devices sender
    join public.rim_e2e_devices recipient on recipient.id=recipient_device_id
    where sender.id=sender_device_id and sender.user_id=(select auth.uid())
      and sender.status='active' and recipient.status='active'
      and sender.algorithm_suite='OPEN-E2EE-SP1' and recipient.algorithm_suite='OPEN-E2EE-SP1'
  )
  and (
    (scope_type in ('direct','group') and exists (
      select 1 from public.conversation_members cm
      join public.conversations c on c.id=cm.conversation_id
      where cm.conversation_id=scope_id and cm.user_id=(select auth.uid())
        and c.e2e_mode='required' and (c.type='direct' or (c.type='group' and c.is_private is true))
    ) and exists (
      select 1 from public.rim_e2e_devices recipient
      join public.conversation_members cm on cm.user_id=recipient.user_id
      where recipient.id=recipient_device_id and cm.conversation_id=scope_id
    ))
    or
    (scope_type='private_channel' and exists (
      select 1 from public.channel_members cm
      join public.channels c on c.id=cm.channel_id
      where cm.channel_id=scope_id and cm.user_id=(select auth.uid())
        and c.is_public is false and c.e2e_mode='required'
    ) and exists (
      select 1 from public.rim_e2e_devices recipient
      join public.channel_members cm on cm.user_id=recipient.user_id
      where recipient.id=recipient_device_id and cm.channel_id=scope_id
    ))
  )
);

-- A request only marks the scope as pending. A trusted deployment step may
-- activate it after the complete protocol and ciphertext-only message path ship.
create or replace function public.rim_e2e_request_scope_enable(p_scope_type text,p_scope_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare
  v_user uuid := auth.uid();
  v_total integer;
  v_ready integer;
  v_is_manager boolean := false;
  v_scope_eligible boolean := false;
  v_epoch bigint;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if p_scope_id is null or p_scope_type is null or p_scope_type not in ('direct','group','private_channel') then
    raise exception 'invalid_e2e_scope' using errcode='22023';
  end if;

  if p_scope_type in ('direct','group') then
    if not exists(select 1 from public.conversation_members where conversation_id=p_scope_id and user_id=v_user) then
      raise exception 'conversation_access_denied' using errcode='42501';
    end if;
    select (c.type='direct' or (c.type='group' and c.is_private is true)),
           (c.type='direct' or c.created_by=v_user or exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=v_user and m.role in ('owner','admin'))),
           c.e2e_epoch
      into v_scope_eligible,v_is_manager,v_epoch
      from public.conversations c where c.id=p_scope_id and c.type=p_scope_type;
    if not found or not v_scope_eligible or not v_is_manager then raise exception 'e2e_not_allowed_for_scope' using errcode='42501'; end if;
    if p_scope_type='direct' and (select count(*) from public.conversation_members where conversation_id=p_scope_id)<>2 then
      raise exception 'invalid_direct_membership' using errcode='22023';
    end if;
    select count(distinct user_id) into v_total from public.conversation_members where conversation_id=p_scope_id;
    select count(distinct cm.user_id) into v_ready
      from public.conversation_members cm
      where cm.conversation_id=p_scope_id and exists(
        select 1 from public.rim_e2e_devices d where d.user_id=cm.user_id and d.status='active' and d.algorithm_suite='OPEN-E2EE-SP1'
      );
    if p_scope_type='group' and not exists(select 1 from public.conversations where id=p_scope_id and is_private is true) then
      raise exception 'e2e_requires_private_group' using errcode='42501';
    end if;
    update public.conversations set e2e_mode='pending',e2e_protocol='OPEN-E2EE-SP1',e2e_epoch=coalesce(e2e_epoch,0)+1 where id=p_scope_id returning e2e_epoch into v_epoch;
  else
    if not exists(select 1 from public.channel_members where channel_id=p_scope_id and user_id=v_user) then
      raise exception 'channel_access_denied' using errcode='42501';
    end if;
    select (c.owner_id=v_user or exists(select 1 from public.channel_members m where m.channel_id=c.id and m.user_id=v_user and m.role in ('owner','admin'))), c.e2e_epoch
      into v_is_manager,v_epoch from public.channels c where c.id=p_scope_id and c.is_public is false;
    if not found or not v_is_manager then raise exception 'e2e_requires_private_channel_manager' using errcode='42501'; end if;
    select count(distinct user_id) into v_total from public.channel_members where channel_id=p_scope_id;
    select count(distinct cm.user_id) into v_ready
      from public.channel_members cm
      where cm.channel_id=p_scope_id and exists(
        select 1 from public.rim_e2e_devices d where d.user_id=cm.user_id and d.status='active' and d.algorithm_suite='OPEN-E2EE-SP1'
      );
    update public.channels set e2e_mode='pending',e2e_protocol='OPEN-E2EE-SP1',e2e_epoch=coalesce(e2e_epoch,0)+1 where id=p_scope_id returning e2e_epoch into v_epoch;
  end if;

  return jsonb_build_object('scope_type',p_scope_type,'scope_id',p_scope_id,'mode','pending','epoch',v_epoch,
    'members_total',coalesce(v_total,0),'members_ready',coalesce(v_ready,0),
    'ready',coalesce(v_total,0)>0 and v_total=coalesce(v_ready,0),
    'note','Pending only. E2E remains inactive until the production protocol and encrypted message path are deployed.');
end $$;
revoke all on function public.rim_e2e_request_scope_enable(text,uuid) from public,anon;
grant execute on function public.rim_e2e_request_scope_enable(text,uuid) to authenticated;

-- Keep public channels out of E2E even if an administrator attempts a direct SQL update.
create or replace function private.rim_guard_public_channel_e2e()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
  if new.is_public is true and new.e2e_mode <> 'off' then
    raise exception 'public_channels_cannot_use_e2e' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.rim_guard_public_channel_e2e() from public,anon,authenticated;
drop trigger if exists rim_guard_public_channel_e2e on public.channels;
create trigger rim_guard_public_channel_e2e before insert or update of is_public,e2e_mode on public.channels
for each row execute function private.rim_guard_public_channel_e2e();


-- Required E2E mode is a privileged state transition; authenticated clients cannot set it directly.
create or replace function private.rim_guard_e2e_activation()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
  if new.e2e_mode='required' and coalesce(old.e2e_mode,'off')<>'required' and auth.role()<>'service_role' then
    raise exception 'e2e_activation_requires_trusted_deployment' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.rim_guard_e2e_activation() from public,anon,authenticated;
drop trigger if exists rim_guard_e2e_activation_conversations on public.conversations;
create trigger rim_guard_e2e_activation_conversations before update of e2e_mode on public.conversations
for each row execute function private.rim_guard_e2e_activation();
drop trigger if exists rim_guard_e2e_activation_channels on public.channels;
create trigger rim_guard_e2e_activation_channels before update of e2e_mode on public.channels
for each row execute function private.rim_guard_e2e_activation();

-- Once a scope is activated by a trusted release, plaintext writes fail closed.
create or replace function private.rim_guard_encrypted_message_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_mode text;
begin
  select e2e_mode into v_mode from public.conversations where id=new.conversation_id;
  if v_mode='required' and (new.encryption_version is distinct from 1 or new.encrypted_payload is null or coalesce(new.body,'')<>'') then
    raise exception 'e2e_required_plaintext_message_rejected' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.rim_guard_encrypted_message_write() from public,anon,authenticated;
drop trigger if exists rim_guard_encrypted_message_write on public.chat_messages;
create trigger rim_guard_encrypted_message_write before insert or update of body,encryption_version,encrypted_payload,conversation_id on public.chat_messages
for each row execute function private.rim_guard_encrypted_message_write();

create or replace function private.rim_guard_encrypted_channel_post_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_mode text; v_public boolean;
begin
  select e2e_mode,is_public into v_mode,v_public from public.channels where id=new.channel_id;
  if v_mode='required' and (v_public is true or new.encryption_version is distinct from 1 or new.encrypted_payload is null or coalesce(new.body,'')<>'') then
    raise exception 'e2e_required_plaintext_channel_post_rejected' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.rim_guard_encrypted_channel_post_write() from public,anon,authenticated;
drop trigger if exists rim_guard_encrypted_channel_post_write on public.channel_posts;
create trigger rim_guard_encrypted_channel_post_write before insert or update of body,encryption_version,encrypted_payload,channel_id on public.channel_posts
for each row execute function private.rim_guard_encrypted_channel_post_write();
