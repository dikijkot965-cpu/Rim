-- Iteration 172: restore missing migration source for E2E scope operations.
-- IMPORTANT: these definitions were read from the active production database
-- because the prior source archive did not contain their original migrations.
-- This is a source-reconciliation migration; it is intentionally NOT applied
-- to production as part of this code-generation run.

create or replace function private.rim_guard_secret_chat_mode()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.is_secret is true and (new.type <> 'direct' or new.e2e_mode <> 'required') then
    raise exception 'secret_chat_requires_direct_e2e' using errcode='23514';
  end if;
  if new.type <> 'direct' and new.is_secret is true then
    raise exception 'secret_chat_must_be_direct' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function private.rim_guard_secret_chat_mode() from public, anon, authenticated;
drop trigger if exists rim_guard_secret_chat_mode on public.conversations;
create trigger rim_guard_secret_chat_mode
before insert or update of type, is_secret, e2e_mode on public.conversations
for each row execute function private.rim_guard_secret_chat_mode();

create or replace function public.rim_create_secret_direct_chat(p_other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_conversation uuid;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if p_other_user is null or p_other_user = v_user then raise exception 'invalid_secret_chat_peer' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=p_other_user) then raise exception 'user_not_found' using errcode='P0002'; end if;
  if exists(
    select 1 from public.user_blocks b
    where (b.blocker_id=v_user and b.blocked_id=p_other_user)
       or (b.blocker_id=p_other_user and b.blocked_id=v_user)
  ) then raise exception 'user_blocked' using errcode='42501'; end if;

  insert into public.conversations(type,created_by,title,is_private,is_secret,e2e_mode,e2e_epoch,e2e_protocol)
  values('direct',v_user,null,true,true,'required',1,'OPEN-E2EE-SP1')
  returning id into v_conversation;

  insert into public.conversation_members(conversation_id,user_id)
  values(v_conversation,v_user),(v_conversation,p_other_user)
  on conflict do nothing;

  return v_conversation;
end;
$$;
revoke all on function public.rim_create_secret_direct_chat(uuid) from public, anon;
grant execute on function public.rim_create_secret_direct_chat(uuid) to authenticated, service_role;

create or replace function public.rim_e2e_activate_scope(p_scope_type text, p_scope_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_total integer := 0;
  v_ready integer := 0;
  v_manager boolean := false;
  v_epoch bigint := 0;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if p_scope_id is null or p_scope_type not in ('group','private_channel') then raise exception 'invalid_e2e_scope' using errcode='22023'; end if;

  if p_scope_type='group' then
    if not exists(select 1 from public.conversation_members where conversation_id=p_scope_id and user_id=v_user) then
      raise exception 'conversation_access_denied' using errcode='42501';
    end if;
    select (c.created_by=v_user or exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=v_user and m.role in ('owner','admin'))),c.e2e_epoch
      into v_manager,v_epoch
      from public.conversations c where c.id=p_scope_id and c.type='group' and c.is_private is true;
    if not found or not v_manager then raise exception 'e2e_requires_private_group_manager' using errcode='42501'; end if;
    select count(distinct user_id) into v_total from public.conversation_members where conversation_id=p_scope_id;
    select count(distinct m.user_id) into v_ready
      from public.conversation_members m
      where m.conversation_id=p_scope_id
        and exists(select 1 from public.rim_e2e_relay_devices d
          where d.user_id=m.user_id and d.status='active' and d.registered=true and d.enabled=true
            and d.protocol_profile='OPEN-E2EE-SP1');
    if v_total<2 or v_ready<>v_total then
      raise exception 'e2e_members_missing_devices:%/%',v_ready,v_total using errcode='42501';
    end if;
    update public.conversations set e2e_mode='required',e2e_protocol='OPEN-E2EE-SP1',e2e_epoch=coalesce(e2e_epoch,0)+1
      where id=p_scope_id returning e2e_epoch into v_epoch;
  else
    if not exists(select 1 from public.channel_members where channel_id=p_scope_id and user_id=v_user) then
      raise exception 'channel_access_denied' using errcode='42501';
    end if;
    select (c.owner_id=v_user or exists(select 1 from public.channel_members m where m.channel_id=c.id and m.user_id=v_user and m.role in ('owner','admin','moderator'))),c.e2e_epoch
      into v_manager,v_epoch from public.channels c where c.id=p_scope_id and c.is_public is false;
    if not found or not v_manager then raise exception 'e2e_requires_private_channel_manager' using errcode='42501'; end if;
    select count(distinct user_id) into v_total from public.channel_members where channel_id=p_scope_id;
    select count(distinct m.user_id) into v_ready
      from public.channel_members m
      where m.channel_id=p_scope_id
        and exists(select 1 from public.rim_e2e_relay_devices d
          where d.user_id=m.user_id and d.status='active' and d.registered=true and d.enabled=true
            and d.protocol_profile='OPEN-E2EE-SP1');
    if v_total<2 or v_ready<>v_total then
      raise exception 'e2e_members_missing_devices:%/%',v_ready,v_total using errcode='42501';
    end if;
    update public.channels set e2e_mode='required',e2e_protocol='OPEN-E2EE-SP1',e2e_epoch=coalesce(e2e_epoch,0)+1
      where id=p_scope_id returning e2e_epoch into v_epoch;
  end if;

  return jsonb_build_object('scope_type',p_scope_type,'scope_id',p_scope_id,'mode','required','epoch',v_epoch,'members_total',v_total,'members_ready',v_ready,'ready',true);
end;
$$;
revoke all on function public.rim_e2e_activate_scope(text,uuid) from public, anon;
grant execute on function public.rim_e2e_activate_scope(text,uuid) to authenticated, service_role;

create or replace function public.rim_e2e_touch_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_user uuid := auth.uid(); v_count integer;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='28000'; end if;
  update public.conversations c
    set last_message_at=now()
    where c.id=p_conversation_id
      and c.is_secret is true
      and c.e2e_mode='required'
      and exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=v_user);
  get diagnostics v_count = row_count;
  if v_count=0 then raise exception 'secret_conversation_access_denied' using errcode='42501'; end if;
  return true;
end;
$$;
revoke all on function public.rim_e2e_touch_conversation(uuid) from public, anon;
grant execute on function public.rim_e2e_touch_conversation(uuid) to authenticated, service_role;

create or replace function public.rim_e2e_touch_scope(p_scope_type text, p_scope_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_user uuid := auth.uid(); v_count integer := 0;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if p_scope_type='private_channel' then
    update public.channels c set last_message_at=now()
    where c.id=p_scope_id and c.is_public is false and c.e2e_mode='required'
      and exists(select 1 from public.channel_members m where m.channel_id=c.id and m.user_id=v_user);
  elsif p_scope_type in ('direct','group') then
    update public.conversations c set last_message_at=now()
    where c.id=p_scope_id and c.e2e_mode='required'
      and ((p_scope_type='direct' and c.type='direct' and c.is_secret is true)
        or (p_scope_type='group' and c.type='group' and c.is_private is true))
      and exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=v_user);
  else
    raise exception 'invalid_e2e_scope' using errcode='22023';
  end if;
  get diagnostics v_count=row_count;
  if v_count=0 then raise exception 'e2e_scope_access_denied' using errcode='42501'; end if;
  return true;
end;
$$;
revoke all on function public.rim_e2e_touch_scope(text,uuid) from public, anon;
grant execute on function public.rim_e2e_touch_scope(text,uuid) to authenticated, service_role;
