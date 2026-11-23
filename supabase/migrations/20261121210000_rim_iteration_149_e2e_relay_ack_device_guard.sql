-- RIM Iteration 149: bind mailbox acknowledgements to an active registered device.
-- Service-role RPC only. The Edge Function derives p_user_id from the verified JWT.

create or replace function public.rim_e2e_relay_mark_delivered(
  p_user_id uuid,
  p_device_id smallint,
  p_envelope_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or p_device_id not between 1 and 5 or p_envelope_id is null then
    raise exception 'invalid_delivery_ack' using errcode = '22023';
  end if;

  perform 1
    from public.rim_e2e_relay_devices d
    where d.user_id = p_user_id
      and d.device_id = p_device_id
      and d.status = 'active'
      and d.registered = true
      and d.enabled = true
    for update;

  if not found then
    raise exception 'device_not_active' using errcode = '42501';
  end if;

  update public.rim_e2e_relay_envelopes e
    set delivered_at = coalesce(e.delivered_at, now())
    where e.id = p_envelope_id
      and e.target_user_id = p_user_id
      and e.target_device_id = p_device_id;

  if not found then
    raise exception 'envelope_not_found_for_device' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.rim_e2e_relay_mark_delivered(uuid, smallint, uuid)
  from public, anon, authenticated;
grant execute on function public.rim_e2e_relay_mark_delivered(uuid, smallint, uuid)
  to service_role;
