-- RIM Iteration 142: application-owned OpenE2EE Signal Protocol relay.
-- The server stores public key material and opaque ciphertext only. It never
-- receives device private keys or plaintext message content.

create table if not exists public.rim_e2e_relay_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id smallint not null check (device_id between 1 and 5),
  device_type text not null default 'web' check (device_type in ('mobile','desktop','tablet','web')),
  encrypted_device_name text,
  registration_id integer not null default 0 check (registration_id between 0 and 65535),
  status text not null default 'active' check (status in ('active','revoked')),
  registered boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  linked_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  primary key (user_id, device_id)
);

create table if not exists public.rim_e2e_relay_identities (
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_type text not null default 'aci' check (identity_type in ('aci','pni')),
  identity jsonb not null,
  commitment text not null check (length(commitment) = 44),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, identity_type)
);

create table if not exists public.rim_e2e_relay_prekeys (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  device_id smallint not null,
  identity_type text not null default 'aci' check (identity_type in ('aci','pni')),
  key_type text not null check (key_type in ('ecPreKey','ecSignedPreKey','kemOneTimePreKey','kemLastResortPreKey')),
  key_id bigint not null check (key_id between 0 and 2147483647),
  public_key text not null,
  signature text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  consumed_at timestamptz,
  foreign key (user_id, device_id) references public.rim_e2e_relay_devices(user_id, device_id) on delete cascade,
  unique (user_id, device_id, identity_type, key_type, key_id)
);

create unique index if not exists rim_e2e_relay_one_reusable_key_type
  on public.rim_e2e_relay_prekeys(user_id, device_id, identity_type, key_type)
  where key_type in ('ecSignedPreKey','kemLastResortPreKey');
create index if not exists rim_e2e_relay_prekey_claim_idx
  on public.rim_e2e_relay_prekeys(user_id, device_id, identity_type, key_type, id)
  where consumed_at is null;

create table if not exists public.rim_e2e_relay_envelopes (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  target_device_id smallint not null,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_device_id smallint not null,
  ciphertext text not null,
  message_type text not null check (message_type in ('ciphertext','prekey_bundle','sender_key','unidentified_sender','retry_request')),
  delivery_class text not null check (delivery_class in ('user-visible','background-sync','ephemeral')),
  content_kind text check (content_kind in ('message','receipt')),
  timestamp_ms bigint not null,
  client_message_id text,
  operation_epoch_ms bigint,
  recipient_registration_id integer,
  declared_device_ids smallint[],
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  delivered_at timestamptz,
  foreign key (target_user_id, target_device_id) references public.rim_e2e_relay_devices(user_id, device_id) on delete cascade,
  foreign key (sender_user_id, sender_device_id) references public.rim_e2e_relay_devices(user_id, device_id) on delete cascade
);
create index if not exists rim_e2e_relay_mailbox_idx
  on public.rim_e2e_relay_envelopes(target_user_id, target_device_id, created_at)
  where delivered_at is null;
create unique index if not exists rim_e2e_relay_envelope_idempotency_idx
  on public.rim_e2e_relay_envelopes(sender_user_id, sender_device_id, client_message_id, target_user_id, target_device_id)
  where client_message_id is not null;

alter table public.rim_e2e_relay_devices enable row level security;
alter table public.rim_e2e_relay_identities enable row level security;
alter table public.rim_e2e_relay_prekeys enable row level security;
alter table public.rim_e2e_relay_envelopes enable row level security;

-- The only client-visible relay rows are opaque envelopes addressed to the
-- authenticated account. All mutations and key operations go through the
-- authenticated Edge Function using service_role after verifying the JWT.
revoke all on public.rim_e2e_relay_devices, public.rim_e2e_relay_identities,
  public.rim_e2e_relay_prekeys, public.rim_e2e_relay_envelopes from anon, authenticated;
grant select on public.rim_e2e_relay_envelopes to authenticated;
drop policy if exists rim_e2e_relay_envelope_recipient_read on public.rim_e2e_relay_envelopes;
create policy rim_e2e_relay_envelope_recipient_read
  on public.rim_e2e_relay_envelopes for select to authenticated
  using (target_user_id = (select auth.uid()));


create or replace function public.rim_e2e_relay_remove_device(p_user_id uuid,p_device_id smallint)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  delete from public.rim_e2e_relay_devices where user_id=p_user_id and device_id=p_device_id;
end $$;

-- Service-only RPC: atomically allocate a device slot (1 primary + 4 linked).
create or replace function public.rim_e2e_relay_register_device(
  p_user_id uuid, p_requested_device_id smallint, p_device_type text,
  p_encrypted_device_name text
) returns smallint
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_device smallint;
begin
  if p_user_id is null then raise exception 'invalid_user' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if p_device_type not in ('mobile','desktop','tablet','web') then raise exception 'invalid_device_type' using errcode='22023'; end if;
  if p_requested_device_id is not null then
    if p_requested_device_id < 1 or p_requested_device_id > 5 then raise exception 'invalid_device_id' using errcode='22023'; end if;
    v_device := p_requested_device_id;
    insert into public.rim_e2e_relay_devices(user_id,device_id,device_type,encrypted_device_name,status,enabled)
    values(p_user_id,v_device,p_device_type,p_encrypted_device_name,'active',true)
    on conflict(user_id,device_id) do update set
      device_type=excluded.device_type, encrypted_device_name=excluded.encrypted_device_name,
      status='active',enabled=true,revoked_at=null,last_seen_at=now();
  else
    select slots.slot into v_device from generate_series(1,5) as slots(slot)
      where not exists(select 1 from public.rim_e2e_relay_devices d where d.user_id=p_user_id and d.device_id=slots.slot and d.status='active')
      order by slots.slot limit 1;
    if v_device is null then raise exception 'device_limit_reached' using errcode='54000'; end if;
    insert into public.rim_e2e_relay_devices(user_id,device_id,device_type,encrypted_device_name,status,enabled)
      values(p_user_id,v_device,p_device_type,p_encrypted_device_name,'active',true);
  end if;
  return v_device;
end $$;

create or replace function public.rim_e2e_relay_provision_identity(
  p_user_id uuid,p_device_id smallint,p_identity_type text,p_identity jsonb,
  p_commitment text,p_registration_id integer
) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_current public.rim_e2e_relay_identities%rowtype;
begin
  if p_identity_type not in ('aci','pni') or p_registration_id not between 0 and 65535 then raise exception 'invalid_identity_provisioning' using errcode='22023'; end if;
  perform 1 from public.rim_e2e_relay_devices where user_id=p_user_id and device_id=p_device_id and status='active' for update;
  if not found then raise exception 'device_not_active' using errcode='42501'; end if;
  select * into v_current from public.rim_e2e_relay_identities where user_id=p_user_id and identity_type=p_identity_type for update;
  if found then
    if v_current.identity is distinct from p_identity or v_current.commitment is distinct from p_commitment then
      raise exception 'identity_tuple_mismatch_requires_rotation' using errcode='23505';
    end if;
  else
    insert into public.rim_e2e_relay_identities(user_id,identity_type,identity,commitment)
      values(p_user_id,p_identity_type,p_identity,p_commitment);
  end if;
  update public.rim_e2e_relay_devices set registration_id=p_registration_id,registered=true,last_seen_at=now()
    where user_id=p_user_id and device_id=p_device_id;
end $$;

create or replace function public.rim_e2e_relay_rotate_identity(
  p_user_id uuid,p_device_id smallint,p_identity_type text,p_identity jsonb,
  p_new_commitment text,p_expected_commitment text,p_registration_id integer
) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_current public.rim_e2e_relay_identities%rowtype;
begin
  select * into v_current from public.rim_e2e_relay_identities
    where user_id=p_user_id and identity_type=p_identity_type for update;
  if not found or v_current.commitment <> p_expected_commitment then
    raise exception 'identity_rotation_conflict' using errcode='40001';
  end if;
  if not exists(select 1 from public.rim_e2e_relay_devices where user_id=p_user_id and device_id=p_device_id and status='active') then
    raise exception 'device_not_active' using errcode='42501';
  end if;
  update public.rim_e2e_relay_identities set identity=p_identity,commitment=p_new_commitment,updated_at=now()
    where user_id=p_user_id and identity_type=p_identity_type;
  delete from public.rim_e2e_relay_prekeys where user_id=p_user_id and identity_type=p_identity_type;
  update public.rim_e2e_relay_devices set registration_id=p_registration_id,registered=true,last_seen_at=now()
    where user_id=p_user_id and device_id=p_device_id;
end $$;

create or replace function public.rim_e2e_relay_upload_prekeys(
  p_user_id uuid,p_device_id smallint,p_identity_type text,p_keys jsonb
) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_key jsonb; v_type text; v_id bigint; v_public text; v_signature text;
begin
  if jsonb_typeof(p_keys) <> 'array' or jsonb_array_length(p_keys) > 300 then raise exception 'invalid_prekey_batch' using errcode='22023'; end if;
  if p_identity_type not in ('aci','pni') then raise exception 'invalid_identity_type' using errcode='22023'; end if;
  perform 1 from public.rim_e2e_relay_devices where user_id=p_user_id and device_id=p_device_id and status='active' and registered=true for update;
  if not found then raise exception 'device_not_registered' using errcode='42501'; end if;
  for v_key in select value from jsonb_array_elements(p_keys) loop
    v_type := v_key->>'type'; v_id := (v_key->>'keyId')::bigint;
    v_public := v_key->>'publicKey'; v_signature := v_key->>'signature';
    if v_type not in ('ecPreKey','ecSignedPreKey','kemOneTimePreKey','kemLastResortPreKey') or v_id < 0 or v_id > 2147483647 or v_public is null then
      raise exception 'invalid_prekey_record' using errcode='22023';
    end if;
    if v_type in ('ecSignedPreKey','kemOneTimePreKey','kemLastResortPreKey') and v_signature is null then
      raise exception 'prekey_signature_required' using errcode='22023';
    end if;
    if v_type in ('ecSignedPreKey','kemLastResortPreKey') then
      delete from public.rim_e2e_relay_prekeys where user_id=p_user_id and device_id=p_device_id and identity_type=p_identity_type and key_type=v_type;
    end if;
    insert into public.rim_e2e_relay_prekeys(user_id,device_id,identity_type,key_type,key_id,public_key,signature,expires_at)
      values(p_user_id,p_device_id,p_identity_type,v_type,v_id,v_public,v_signature,
        case when v_type in ('ecSignedPreKey','kemLastResortPreKey') then now()+interval '14 days' else null end)
      on conflict (user_id,device_id,identity_type,key_type,key_id) do nothing;
  end loop;
end $$;

create or replace function public.rim_e2e_relay_fetch_prekey_bundle(
  p_requester_user_id uuid,p_target_user_id uuid,p_device_id smallint,p_identity_type text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_device public.rim_e2e_relay_devices%rowtype; v_identity public.rim_e2e_relay_identities%rowtype;
  v_signed public.rim_e2e_relay_prekeys%rowtype; v_ec public.rim_e2e_relay_prekeys%rowtype;
  v_kem_one public.rim_e2e_relay_prekeys%rowtype; v_kem_last public.rim_e2e_relay_prekeys%rowtype;
begin
  if p_requester_user_id is null or p_target_user_id is null or p_target_user_id=p_requester_user_id then raise exception 'invalid_prekey_target' using errcode='22023'; end if;
  if exists(select 1 from public.user_blocks b where (b.blocker_id=p_requester_user_id and b.blocked_id=p_target_user_id) or (b.blocker_id=p_target_user_id and b.blocked_id=p_requester_user_id)) then
    raise exception 'user_blocked' using errcode='42501';
  end if;
  select * into v_device from public.rim_e2e_relay_devices where user_id=p_target_user_id and device_id=p_device_id and status='active' and enabled=true and registered=true;
  if not found then return null; end if;
  select * into v_identity from public.rim_e2e_relay_identities where user_id=p_target_user_id and identity_type=p_identity_type;
  if not found then return null; end if;
  select * into v_signed from public.rim_e2e_relay_prekeys where user_id=p_target_user_id and device_id=p_device_id and identity_type=p_identity_type and key_type='ecSignedPreKey' and expires_at>now() order by created_at desc limit 1;
  if not found then return null; end if;
  select * into v_ec from public.rim_e2e_relay_prekeys where user_id=p_target_user_id and device_id=p_device_id and identity_type=p_identity_type and key_type='ecPreKey' and consumed_at is null order by id limit 1 for update skip locked;
  if found then update public.rim_e2e_relay_prekeys set consumed_at=now() where id=v_ec.id; end if;
  select * into v_kem_one from public.rim_e2e_relay_prekeys where user_id=p_target_user_id and device_id=p_device_id and identity_type=p_identity_type and key_type='kemOneTimePreKey' and consumed_at is null order by id limit 1 for update skip locked;
  if found then update public.rim_e2e_relay_prekeys set consumed_at=now() where id=v_kem_one.id; end if;
  select * into v_kem_last from public.rim_e2e_relay_prekeys where user_id=p_target_user_id and device_id=p_device_id and identity_type=p_identity_type and key_type='kemLastResortPreKey' and expires_at>now() order by created_at desc limit 1;
  if v_kem_one.id is null and v_kem_last.id is null then return null; end if;
  update public.rim_e2e_relay_devices set last_seen_at=now() where user_id=p_target_user_id and device_id=p_device_id;
  return jsonb_build_object(
    'registrationId',v_device.registration_id,'deviceId',v_device.device_id,'identity',v_identity.identity,
    'ecSignedPreKey',jsonb_build_object('keyId',v_signed.key_id,'publicKey',v_signed.public_key,'signature',v_signed.signature),
    'ecOneTimePreKey',case when v_ec.id is null then null else jsonb_build_object('keyId',v_ec.key_id,'publicKey',v_ec.public_key) end,
    'kemOneTimePreKey',case when v_kem_one.id is null then null else jsonb_build_object('keyId',v_kem_one.key_id,'publicKey',v_kem_one.public_key,'signature',v_kem_one.signature) end,
    'kemLastResortPreKey',case when v_kem_one.id is not null or v_kem_last.id is null then null else jsonb_build_object('keyId',v_kem_last.key_id,'publicKey',v_kem_last.public_key,'signature',v_kem_last.signature) end
  );
end $$;

create or replace function public.rim_e2e_relay_send_envelope(p_envelope jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.rim_e2e_relay_envelopes%rowtype; v_sender uuid; v_target uuid; v_sd smallint; v_td smallint; v_client text; v_registration integer; v_declared smallint[]; v_actual smallint[];
begin
  v_sender := (p_envelope->>'senderUserId')::uuid; v_target := (p_envelope->>'targetUserId')::uuid;
  v_sd := (p_envelope->>'senderDeviceId')::smallint; v_td := (p_envelope->>'targetDeviceId')::smallint;
  if v_sender is null or v_target is null or v_sd not between 1 and 5 or v_td not between 1 and 5 then raise exception 'invalid_envelope_route' using errcode='22023'; end if;
  if not exists(select 1 from public.rim_e2e_relay_devices where user_id=v_sender and device_id=v_sd and status='active' and registered=true and enabled=true) then raise exception 'sender_device_unavailable' using errcode='42501'; end if;
  select registration_id into v_registration from public.rim_e2e_relay_devices where user_id=v_target and device_id=v_td and status='active' and registered=true and enabled=true;
  if not found then raise exception 'target_device_unavailable' using errcode='P0002'; end if;
  if nullif(p_envelope->>'recipientRegistrationId','') is not null and (p_envelope->>'recipientRegistrationId')::integer <> v_registration then
    raise exception 'STALE_DEVICE' using errcode='40001';
  end if;
  if jsonb_typeof(p_envelope->'declaredDeviceIds')='array' then
    select array_agg(value::smallint order by value::smallint) into v_declared from jsonb_array_elements_text(p_envelope->'declaredDeviceIds') value;
    select array_agg(device_id order by device_id) into v_actual from public.rim_e2e_relay_devices where user_id=v_target and status='active' and registered=true and enabled=true;
    if v_declared is distinct from v_actual then raise exception 'DEVICE_SET_MISMATCH' using errcode='40001'; end if;
  end if;
  if exists(select 1 from public.user_blocks b where (b.blocker_id=v_sender and b.blocked_id=v_target) or (b.blocker_id=v_target and b.blocked_id=v_sender)) then raise exception 'user_blocked' using errcode='42501'; end if;
  if coalesce(p_envelope->>'messageType','') not in ('ciphertext','prekey_bundle','sender_key','unidentified_sender','retry_request') then raise exception 'invalid_message_type' using errcode='22023'; end if;
  if coalesce(p_envelope->>'deliveryClass','') not in ('user-visible','background-sync','ephemeral') then raise exception 'invalid_delivery_class' using errcode='22023'; end if;
  if coalesce(length(p_envelope->>'ciphertext'),0) < 1 or length(p_envelope->>'ciphertext') > 400000 then raise exception 'invalid_ciphertext_size' using errcode='22023'; end if;
  if nullif(p_envelope->>'clientMessageId','') is not null then
    v_client := left(p_envelope->>'clientMessageId', 128);
    select * into v_row from public.rim_e2e_relay_envelopes where sender_user_id=v_sender and sender_device_id=v_sd and client_message_id=v_client and target_user_id=v_target and target_device_id=v_td;
    if found then return jsonb_build_object('messageId',v_row.id,'serverTimestamp',(extract(epoch from v_row.created_at)*1000)::bigint,'duplicate',true,'expiresAt',(extract(epoch from v_row.expires_at)*1000)::bigint,'deviceSetChecked',v_declared is not null); end if;
  end if;
  insert into public.rim_e2e_relay_envelopes(
    target_user_id,target_device_id,sender_user_id,sender_device_id,ciphertext,message_type,delivery_class,content_kind,
    timestamp_ms,client_message_id,operation_epoch_ms,recipient_registration_id,declared_device_ids,expires_at
  ) values (
    v_target,v_td,v_sender,v_sd,p_envelope->>'ciphertext',p_envelope->>'messageType',p_envelope->>'deliveryClass',
    nullif(p_envelope->>'contentKind',''),(p_envelope->>'timestamp')::bigint,v_client,
    nullif(p_envelope->>'operationEpochMilliseconds','')::bigint,
    nullif(p_envelope->>'recipientRegistrationId','')::integer,
    case when jsonb_typeof(p_envelope->'declaredDeviceIds')='array' then array(select jsonb_array_elements_text(p_envelope->'declaredDeviceIds')::smallint) else null end,
    now()+case p_envelope->>'deliveryClass' when 'ephemeral' then interval '2 minutes' when 'background-sync' then interval '14 days' else interval '30 days' end
  ) on conflict (sender_user_id,sender_device_id,client_message_id,target_user_id,target_device_id)
    where client_message_id is not null do nothing
    returning * into v_row;
  if not found and v_client is not null then
    select * into v_row from public.rim_e2e_relay_envelopes
      where sender_user_id=v_sender and sender_device_id=v_sd and client_message_id=v_client
        and target_user_id=v_target and target_device_id=v_td;
    if found then
      return jsonb_build_object('messageId',v_row.id,'serverTimestamp',(extract(epoch from v_row.created_at)*1000)::bigint,'duplicate',true,'expiresAt',(extract(epoch from v_row.expires_at)*1000)::bigint,'deviceSetChecked',v_declared is not null);
    end if;
  end if;
  return jsonb_build_object('messageId',v_row.id,'serverTimestamp',(extract(epoch from v_row.created_at)*1000)::bigint,'duplicate',false,'expiresAt',(extract(epoch from v_row.expires_at)*1000)::bigint,'deviceSetChecked',v_declared is not null);
end $$;

create or replace function public.rim_e2e_relay_mark_delivered(p_user_id uuid,p_device_id smallint,p_envelope_id uuid)
returns void language sql security definer set search_path=pg_catalog,public as $$
  update public.rim_e2e_relay_envelopes set delivered_at=coalesce(delivered_at,now())
  where id=p_envelope_id and target_user_id=p_user_id and target_device_id=p_device_id;
$$;

-- RPC execution is restricted to the service role used by rim-e2e-relay.
revoke all on function public.rim_e2e_relay_remove_device(uuid,smallint) from public,anon,authenticated;
revoke all on function public.rim_e2e_relay_register_device(uuid,smallint,text,text) from public,anon,authenticated;
revoke all on function public.rim_e2e_relay_provision_identity(uuid,smallint,text,jsonb,text,integer) from public,anon,authenticated;
revoke all on function public.rim_e2e_relay_rotate_identity(uuid,smallint,text,jsonb,text,text,integer) from public,anon,authenticated;
revoke all on function public.rim_e2e_relay_upload_prekeys(uuid,smallint,text,jsonb) from public,anon,authenticated;
revoke all on function public.rim_e2e_relay_fetch_prekey_bundle(uuid,uuid,smallint,text) from public,anon,authenticated;
revoke all on function public.rim_e2e_relay_send_envelope(jsonb) from public,anon,authenticated;
revoke all on function public.rim_e2e_relay_mark_delivered(uuid,smallint,uuid) from public,anon,authenticated;
grant execute on function public.rim_e2e_relay_remove_device(uuid,smallint) to service_role;
grant execute on function public.rim_e2e_relay_register_device(uuid,smallint,text,text) to service_role;
grant execute on function public.rim_e2e_relay_provision_identity(uuid,smallint,text,jsonb,text,integer) to service_role;
grant execute on function public.rim_e2e_relay_rotate_identity(uuid,smallint,text,jsonb,text,text,integer) to service_role;
grant execute on function public.rim_e2e_relay_upload_prekeys(uuid,smallint,text,jsonb) to service_role;
grant execute on function public.rim_e2e_relay_fetch_prekey_bundle(uuid,uuid,smallint,text) to service_role;
grant execute on function public.rim_e2e_relay_send_envelope(jsonb) to service_role;
grant execute on function public.rim_e2e_relay_mark_delivered(uuid,smallint,uuid) to service_role;

-- Realtime delivers only opaque envelope rows to their recipient account.
do $$ begin
  alter publication supabase_realtime add table public.rim_e2e_relay_envelopes;
exception when duplicate_object then null; when undefined_object then null; end $$;
