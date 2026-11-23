-- RIM Iteration 158: make device revocation durable.
-- A revoked device slot is a tombstone. The same authenticated account must
-- not silently reactivate that slot from an old browser's retained local keys.
-- A future trusted-device linking flow may explicitly authorize replacement.

create or replace function public.rim_e2e_relay_remove_device(
  p_user_id uuid,
  p_device_id smallint
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or p_device_id not between 1 and 5 then
    raise exception 'invalid_device_revocation' using errcode = '22023';
  end if;

  perform 1
    from public.rim_e2e_relay_devices d
    where d.user_id = p_user_id and d.device_id = p_device_id
    for update;

  if not found then
    raise exception 'device_not_found' using errcode = 'P0002';
  end if;

  -- Preserve the slot as a tombstone; do not DELETE it and allow the old
  -- browser to recreate it on its next login.
  update public.rim_e2e_relay_devices
    set status = 'revoked',
        enabled = false,
        registered = false,
        revoked_at = coalesce(revoked_at, now()),
        last_seen_at = now()
    where user_id = p_user_id and device_id = p_device_id;

  -- Remove device-scoped public prekeys and queued envelopes. The account-level
  -- identity remains because it is shared by the account and other devices.
  delete from public.rim_e2e_relay_prekeys
    where user_id = p_user_id and device_id = p_device_id;

  delete from public.rim_e2e_relay_envelopes
    where (sender_user_id = p_user_id and sender_device_id = p_device_id)
       or (target_user_id = p_user_id and target_device_id = p_device_id);
end;
$$;

create or replace function public.rim_e2e_relay_register_device(
  p_user_id uuid,
  p_requested_device_id smallint,
  p_device_type text,
  p_encrypted_device_name text
)
returns smallint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.rim_e2e_relay_devices%rowtype;
begin
  if p_user_id is null then
    raise exception 'invalid_user' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if p_device_type not in ('mobile','desktop','tablet','web') then
    raise exception 'invalid_device_type' using errcode = '22023';
  end if;
  if p_requested_device_id is null then
    raise exception 'secure_device_link_required' using errcode = '42501';
  end if;
  if p_requested_device_id <> 1 then
    raise exception 'secondary_device_requires_link_approval' using errcode = '42501';
  end if;

  select * into v_existing
    from public.rim_e2e_relay_devices
    where user_id = p_user_id and device_id = 1
    for update;

  if found then
    if v_existing.status = 'revoked' or v_existing.revoked_at is not null then
      raise exception 'device_slot_revoked_requires_secure_link' using errcode = '42501';
    end if;
    if v_existing.status <> 'active' then
      raise exception 'device_slot_unavailable' using errcode = '42501';
    end if;
    if v_existing.registered then
      raise exception 'primary_device_already_registered' using errcode = '23505';
    end if;

    -- An interrupted first-time provisioning may retry the still-active,
    -- unregistered primary slot. Do not clear revocation or registration state.
    update public.rim_e2e_relay_devices
      set device_type = p_device_type,
          encrypted_device_name = p_encrypted_device_name,
          enabled = true,
          last_seen_at = now()
      where user_id = p_user_id and device_id = 1;
  else
    insert into public.rim_e2e_relay_devices(
      user_id, device_id, device_type, encrypted_device_name,
      status, enabled, registered, revoked_at
    ) values (
      p_user_id, 1, p_device_type, p_encrypted_device_name,
      'active', true, false, null
    );
  end if;

  return 1;
end;
$$;

revoke all on function public.rim_e2e_relay_remove_device(uuid, smallint)
  from public, anon, authenticated;
revoke all on function public.rim_e2e_relay_register_device(uuid, smallint, text, text)
  from public, anon, authenticated;
grant execute on function public.rim_e2e_relay_remove_device(uuid, smallint)
  to service_role;
grant execute on function public.rim_e2e_relay_register_device(uuid, smallint, text, text)
  to service_role;
