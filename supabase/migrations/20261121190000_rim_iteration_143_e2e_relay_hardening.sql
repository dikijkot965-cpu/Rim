-- RIM Iteration 143: harden the Signal relay's device and prekey lifecycle.
-- Additive/replace-only changes. No production data is modified by this file
-- until the migration is explicitly applied.

-- Scope readiness must read the same device registry as the Signal relay.
alter table public.rim_e2e_relay_devices
  add column if not exists protocol_profile text not null default 'OPEN-E2EE-SP1';
alter table public.rim_e2e_relay_devices
  drop constraint if exists rim_e2e_relay_devices_protocol_profile_check;
alter table public.rim_e2e_relay_devices
  add constraint rim_e2e_relay_devices_protocol_profile_check
  check (protocol_profile = 'OPEN-E2EE-SP1');

-- The initial registration endpoint must not let an authenticated browser
-- silently take over an already registered primary device or self-assign a
-- secondary device. Secondary devices remain unavailable until the QR/link
-- approval and encrypted identity-transfer flow is implemented.
create or replace function public.rim_e2e_relay_register_device(
  p_user_id uuid, p_requested_device_id smallint, p_device_type text,
  p_encrypted_device_name text
) returns smallint
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_existing public.rim_e2e_relay_devices%rowtype;
begin
  if p_user_id is null then raise exception 'invalid_user' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if p_device_type not in ('mobile','desktop','tablet','web') then raise exception 'invalid_device_type' using errcode='22023'; end if;
  if p_requested_device_id is null then
    raise exception 'secure_device_link_required' using errcode='42501';
  end if;
  if p_requested_device_id <> 1 then
    raise exception 'secondary_device_requires_link_approval' using errcode='42501';
  end if;

  select * into v_existing from public.rim_e2e_relay_devices
    where user_id=p_user_id and device_id=1 for update;
  if found and v_existing.status='active' and v_existing.registered=true then
    raise exception 'primary_device_already_registered' using errcode='23505';
  end if;

  insert into public.rim_e2e_relay_devices(user_id,device_id,device_type,encrypted_device_name,status,enabled,registered)
  values(p_user_id,1,p_device_type,p_encrypted_device_name,'active',true,false)
  on conflict(user_id,device_id) do update set
    device_type=excluded.device_type,
    encrypted_device_name=excluded.encrypted_device_name,
    status='active',enabled=true,registered=false,revoked_at=null,last_seen_at=now();
  return 1;
end $$;

-- Rate-limit prekey bundle requests by authenticated account and target device.
-- This prevents a compromised account session from exhausting another user's
-- one-time prekey inventory. Private table: only service_role can access it.
create table if not exists public.rim_e2e_relay_prekey_fetch_limits (
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  target_device_id smallint not null check (target_device_id between 1 and 5),
  bucket_started_at timestamptz not null,
  attempts integer not null default 1 check (attempts between 1 and 30),
  primary key (requester_user_id,target_user_id,target_device_id,bucket_started_at)
);
create index if not exists rim_e2e_relay_prekey_fetch_limits_cleanup_idx
  on public.rim_e2e_relay_prekey_fetch_limits(bucket_started_at);
alter table public.rim_e2e_relay_prekey_fetch_limits enable row level security;
revoke all on public.rim_e2e_relay_prekey_fetch_limits from public,anon,authenticated;
grant all on public.rim_e2e_relay_prekey_fetch_limits to service_role;

-- Replace the original four-argument function. A registered requester device
-- is required. KEM availability is checked BEFORE consuming the EC one-time
-- prekey, avoiding accidental loss of an EC key when no PQ key can be returned.
drop function if exists public.rim_e2e_relay_fetch_prekey_bundle(uuid,uuid,smallint,text);
create function public.rim_e2e_relay_fetch_prekey_bundle(
  p_requester_user_id uuid,p_requester_device_id smallint,
  p_target_user_id uuid,p_device_id smallint,p_identity_type text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_device public.rim_e2e_relay_devices%rowtype;
  v_identity public.rim_e2e_relay_identities%rowtype;
  v_signed public.rim_e2e_relay_prekeys%rowtype;
  v_ec public.rim_e2e_relay_prekeys%rowtype;
  v_kem_one public.rim_e2e_relay_prekeys%rowtype;
  v_kem_last public.rim_e2e_relay_prekeys%rowtype;
  v_bucket timestamptz;
  v_attempts integer;
begin
  if p_requester_user_id is null or p_target_user_id is null
     or p_target_user_id=p_requester_user_id
     or p_requester_device_id not between 1 and 5
     or p_device_id not between 1 and 5
     or p_identity_type not in ('aci','pni') then
    raise exception 'invalid_prekey_target' using errcode='22023';
  end if;

  if not exists(select 1 from public.rim_e2e_relay_devices
    where user_id=p_requester_user_id and device_id=p_requester_device_id
      and status='active' and registered=true and enabled=true) then
    raise exception 'requester_device_not_registered' using errcode='42501';
  end if;

  if exists(select 1 from public.user_blocks b
    where (b.blocker_id=p_requester_user_id and b.blocked_id=p_target_user_id)
       or (b.blocker_id=p_target_user_id and b.blocked_id=p_requester_user_id)) then
    raise exception 'user_blocked' using errcode='42501';
  end if;

  v_bucket := to_timestamp(floor(extract(epoch from now())/600)*600);
  insert into public.rim_e2e_relay_prekey_fetch_limits(
    requester_user_id,target_user_id,target_device_id,bucket_started_at,attempts
  ) values(p_requester_user_id,p_target_user_id,p_device_id,v_bucket,1)
  on conflict(requester_user_id,target_user_id,target_device_id,bucket_started_at)
  do update set attempts=public.rim_e2e_relay_prekey_fetch_limits.attempts+1
    where public.rim_e2e_relay_prekey_fetch_limits.attempts < 30
  returning attempts into v_attempts;
  if not found then raise exception 'prekey_fetch_rate_limited' using errcode='54000'; end if;

  -- Opportunistic cleanup keeps the limiter table bounded.
  delete from public.rim_e2e_relay_prekey_fetch_limits
    where bucket_started_at < now()-interval '2 days';

  select * into v_device from public.rim_e2e_relay_devices
    where user_id=p_target_user_id and device_id=p_device_id
      and status='active' and enabled=true and registered=true;
  if not found then return null; end if;
  select * into v_identity from public.rim_e2e_relay_identities
    where user_id=p_target_user_id and identity_type=p_identity_type;
  if not found then return null; end if;
  select * into v_signed from public.rim_e2e_relay_prekeys
    where user_id=p_target_user_id and device_id=p_device_id and identity_type=p_identity_type
      and key_type='ecSignedPreKey' and expires_at>now()
    order by created_at desc limit 1;
  if not found then return null; end if;

  select * into v_kem_one from public.rim_e2e_relay_prekeys
    where user_id=p_target_user_id and device_id=p_device_id and identity_type=p_identity_type
      and key_type='kemOneTimePreKey' and consumed_at is null
    order by id limit 1 for update skip locked;
  if not found then
    select * into v_kem_last from public.rim_e2e_relay_prekeys
      where user_id=p_target_user_id and device_id=p_device_id and identity_type=p_identity_type
        and key_type='kemLastResortPreKey' and expires_at>now()
      order by created_at desc limit 1;
    if not found then return null; end if;
  end if;

  -- Consume the optional EC one-time key only after a complete PQ-capable
  -- bundle is guaranteed to be returned.
  select * into v_ec from public.rim_e2e_relay_prekeys
    where user_id=p_target_user_id and device_id=p_device_id and identity_type=p_identity_type
      and key_type='ecPreKey' and consumed_at is null
    order by id limit 1 for update skip locked;
  if found then
    update public.rim_e2e_relay_prekeys set consumed_at=now() where id=v_ec.id;
  end if;
  if v_kem_one.id is not null then
    update public.rim_e2e_relay_prekeys set consumed_at=now() where id=v_kem_one.id;
  end if;
  update public.rim_e2e_relay_devices set last_seen_at=now()
    where user_id=p_target_user_id and device_id=p_device_id;

  return jsonb_build_object(
    'registrationId',v_device.registration_id,
    'deviceId',v_device.device_id,
    'identity',v_identity.identity,
    'ecSignedPreKey',jsonb_build_object('keyId',v_signed.key_id,'publicKey',v_signed.public_key,'signature',v_signed.signature),
    'ecOneTimePreKey',case when v_ec.id is null then null else jsonb_build_object('keyId',v_ec.key_id,'publicKey',v_ec.public_key) end,
    'kemOneTimePreKey',case when v_kem_one.id is null then null else jsonb_build_object('keyId',v_kem_one.key_id,'publicKey',v_kem_one.public_key,'signature',v_kem_one.signature) end,
    'kemLastResortPreKey',case when v_kem_one.id is not null or v_kem_last.id is null then null else jsonb_build_object('keyId',v_kem_last.key_id,'publicKey',v_kem_last.public_key,'signature',v_kem_last.signature) end
  );
end $$;

-- The legacy four-argument overload was already revoked by Iteration 142 before being dropped above.
revoke all on function public.rim_e2e_relay_fetch_prekey_bundle(uuid,smallint,uuid,smallint,text) from public,anon,authenticated;
grant execute on function public.rim_e2e_relay_fetch_prekey_bundle(uuid,smallint,uuid,smallint,text) to service_role;

-- The SDK uses needsSync to know when the sender has another active device
-- that must receive a self-sync copy. Return it on new and idempotent sends.
create or replace function public.rim_e2e_relay_send_envelope(p_envelope jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_row public.rim_e2e_relay_envelopes%rowtype;
  v_sender uuid; v_target uuid; v_sd smallint; v_td smallint;
  v_client text; v_registration integer;
  v_declared smallint[]; v_actual smallint[];
  v_needs_sync boolean := false;
begin
  v_sender := (p_envelope->>'senderUserId')::uuid;
  v_target := (p_envelope->>'targetUserId')::uuid;
  v_sd := (p_envelope->>'senderDeviceId')::smallint;
  v_td := (p_envelope->>'targetDeviceId')::smallint;
  if v_sender is null or v_target is null or v_sd not between 1 and 5 or v_td not between 1 and 5 then
    raise exception 'invalid_envelope_route' using errcode='22023';
  end if;
  if not exists(select 1 from public.rim_e2e_relay_devices
    where user_id=v_sender and device_id=v_sd and status='active' and registered=true and enabled=true) then
    raise exception 'sender_device_unavailable' using errcode='42501';
  end if;
  select exists(select 1 from public.rim_e2e_relay_devices
    where user_id=v_sender and device_id<>v_sd and status='active' and registered=true and enabled=true)
    into v_needs_sync;
  select registration_id into v_registration from public.rim_e2e_relay_devices
    where user_id=v_target and device_id=v_td and status='active' and registered=true and enabled=true;
  if not found then raise exception 'target_device_unavailable' using errcode='P0002'; end if;
  if nullif(p_envelope->>'recipientRegistrationId','') is not null
     and (p_envelope->>'recipientRegistrationId')::integer <> v_registration then
    raise exception 'STALE_DEVICE' using errcode='40001';
  end if;
  if jsonb_typeof(p_envelope->'declaredDeviceIds')='array' then
    select array_agg(value::smallint order by value::smallint)
      into v_declared from jsonb_array_elements_text(p_envelope->'declaredDeviceIds') value;
    select array_agg(device_id order by device_id) into v_actual
      from public.rim_e2e_relay_devices
      where user_id=v_target and status='active' and registered=true and enabled=true;
    if v_declared is distinct from v_actual then raise exception 'DEVICE_SET_MISMATCH' using errcode='40001'; end if;
  end if;
  if exists(select 1 from public.user_blocks b
    where (b.blocker_id=v_sender and b.blocked_id=v_target)
       or (b.blocker_id=v_target and b.blocked_id=v_sender)) then
    raise exception 'user_blocked' using errcode='42501';
  end if;
  if coalesce(p_envelope->>'messageType','') not in ('ciphertext','prekey_bundle','sender_key','unidentified_sender','retry_request') then
    raise exception 'invalid_message_type' using errcode='22023';
  end if;
  if coalesce(p_envelope->>'deliveryClass','') not in ('user-visible','background-sync','ephemeral') then
    raise exception 'invalid_delivery_class' using errcode='22023';
  end if;
  if coalesce(length(p_envelope->>'ciphertext'),0)<1 or length(p_envelope->>'ciphertext')>400000 then
    raise exception 'invalid_ciphertext_size' using errcode='22023';
  end if;
  if nullif(p_envelope->>'clientMessageId','') is not null then
    v_client := left(p_envelope->>'clientMessageId',128);
    select * into v_row from public.rim_e2e_relay_envelopes
      where sender_user_id=v_sender and sender_device_id=v_sd and client_message_id=v_client
        and target_user_id=v_target and target_device_id=v_td;
    if found then
      return jsonb_build_object('messageId',v_row.id,'serverTimestamp',(extract(epoch from v_row.created_at)*1000)::bigint,
        'duplicate',true,'expiresAt',(extract(epoch from v_row.expires_at)*1000)::bigint,
        'deviceSetChecked',v_declared is not null,'needsSync',v_needs_sync);
    end if;
  end if;
  insert into public.rim_e2e_relay_envelopes(
    target_user_id,target_device_id,sender_user_id,sender_device_id,ciphertext,message_type,delivery_class,
    content_kind,timestamp_ms,client_message_id,operation_epoch_ms,recipient_registration_id,declared_device_ids,expires_at
  ) values (
    v_target,v_td,v_sender,v_sd,p_envelope->>'ciphertext',p_envelope->>'messageType',p_envelope->>'deliveryClass',
    nullif(p_envelope->>'contentKind',''),(p_envelope->>'timestamp')::bigint,v_client,
    nullif(p_envelope->>'operationEpochMilliseconds','')::bigint,
    nullif(p_envelope->>'recipientRegistrationId','')::integer,
    case when jsonb_typeof(p_envelope->'declaredDeviceIds')='array'
      then array(select jsonb_array_elements_text(p_envelope->'declaredDeviceIds')::smallint) else null end,
    now()+case p_envelope->>'deliveryClass' when 'ephemeral' then interval '2 minutes'
      when 'background-sync' then interval '14 days' else interval '30 days' end
  ) on conflict (sender_user_id,sender_device_id,client_message_id,target_user_id,target_device_id)
    where client_message_id is not null do nothing returning * into v_row;
  if not found and v_client is not null then
    select * into v_row from public.rim_e2e_relay_envelopes
      where sender_user_id=v_sender and sender_device_id=v_sd and client_message_id=v_client
        and target_user_id=v_target and target_device_id=v_td;
    if found then
      return jsonb_build_object('messageId',v_row.id,'serverTimestamp',(extract(epoch from v_row.created_at)*1000)::bigint,
        'duplicate',true,'expiresAt',(extract(epoch from v_row.expires_at)*1000)::bigint,
        'deviceSetChecked',v_declared is not null,'needsSync',v_needs_sync);
    end if;
  end if;
  return jsonb_build_object('messageId',v_row.id,'serverTimestamp',(extract(epoch from v_row.created_at)*1000)::bigint,
    'duplicate',false,'expiresAt',(extract(epoch from v_row.expires_at)*1000)::bigint,
    'deviceSetChecked',v_declared is not null,'needsSync',v_needs_sync);
end $$;

revoke all on function public.rim_e2e_relay_register_device(uuid,smallint,text,text) from public,anon,authenticated;
grant execute on function public.rim_e2e_relay_register_device(uuid,smallint,text,text) to service_role;
revoke all on function public.rim_e2e_relay_send_envelope(jsonb) from public,anon,authenticated;
grant execute on function public.rim_e2e_relay_send_envelope(jsonb) to service_role;
