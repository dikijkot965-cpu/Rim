-- RIM Iteration 145: expose only membership-scoped E2E device readiness.
-- Iteration 142 deliberately revoked direct client SELECT on relay device
-- metadata. The old scope repository still queried that table directly, so
-- readiness checks would fail under the actual production grants/RLS model.
-- This SECURITY DEFINER RPC validates membership and returns only the minimal
-- device status/profile fields needed by the client-side readiness evaluator.

create or replace function public.rim_e2e_get_scope_device_readiness(
  p_scope_type text,
  p_scope_id uuid
)
returns table(user_id uuid, status text, protocol_profile text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_conversation_type text;
  v_is_private boolean;
  v_is_public boolean;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_scope_id is null or p_scope_type is null or p_scope_type not in ('direct', 'group', 'private_channel') then
    raise exception 'invalid_e2e_scope' using errcode = '22023';
  end if;

  if p_scope_type in ('direct', 'group') then
    select c.type, c.is_private
      into v_conversation_type, v_is_private
      from public.conversations c
      where c.id = p_scope_id;
    if not found or v_conversation_type <> p_scope_type then
      raise exception 'e2e_scope_not_found' using errcode = 'P0002';
    end if;
    if p_scope_type = 'group' and v_is_private is not true then
      raise exception 'e2e_requires_private_group' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = p_scope_id and cm.user_id = v_actor
    ) then
      raise exception 'conversation_access_denied' using errcode = '42501';
    end if;
    if p_scope_type = 'direct' and (
      select count(*) from public.conversation_members cm
      where cm.conversation_id = p_scope_id
    ) <> 2 then
      raise exception 'invalid_direct_membership' using errcode = '22023';
    end if;

    return query
      select members.user_id, devices.status, devices.protocol_profile
      from (
        select distinct cm.user_id
        from public.conversation_members cm
        where cm.conversation_id = p_scope_id
      ) as members
      left join public.rim_e2e_relay_devices as devices
        on devices.user_id = members.user_id
       and devices.status = 'active'
       and devices.enabled = true
       and devices.registered = true;
    return;
  end if;

  select c.is_public
    into v_is_public
    from public.channels c
    where c.id = p_scope_id;
  if not found or v_is_public is not false then
    raise exception 'e2e_requires_private_channel' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.channel_members cm
    where cm.channel_id = p_scope_id and cm.user_id = v_actor
  ) then
    raise exception 'channel_access_denied' using errcode = '42501';
  end if;

  return query
    select members.user_id, devices.status, devices.protocol_profile
    from (
      select distinct cm.user_id
      from public.channel_members cm
      where cm.channel_id = p_scope_id
    ) as members
    left join public.rim_e2e_relay_devices as devices
      on devices.user_id = members.user_id
     and devices.status = 'active'
     and devices.enabled = true
     and devices.registered = true;
end;
$$;

revoke all on function public.rim_e2e_get_scope_device_readiness(text, uuid) from public, anon;
grant execute on function public.rim_e2e_get_scope_device_readiness(text, uuid) to authenticated;
