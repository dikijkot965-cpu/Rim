create table if not exists public.rim_e2e_devices(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 device_label text not null default 'Устройство', identity_dh_public jsonb not null, identity_sign_public jsonb not null,
 fingerprint text not null, algorithm_suite text not null default 'RIM-E2E-EXPERIMENTAL-1',
 status text not null default 'active' check(status in ('active','revoked')),
 created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), revoked_at timestamptz,
 unique(user_id,fingerprint)
);
create table if not exists public.rim_e2e_signed_prekeys(
 device_id uuid primary key references public.rim_e2e_devices(id) on delete cascade,
 key_id bigint not null, public_key jsonb not null, signature text not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null
);
create table if not exists public.rim_e2e_one_time_prekeys(
 id bigint generated always as identity primary key, device_id uuid not null references public.rim_e2e_devices(id) on delete cascade,
 key_id bigint not null, public_key jsonb not null, created_at timestamptz not null default now(), consumed_at timestamptz,
 unique(device_id,key_id)
);
create table if not exists public.rim_e2e_key_change_events(
 id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade,
 device_id uuid not null references public.rim_e2e_devices(id) on delete cascade,
 fingerprint text not null, event_type text not null check(event_type in ('registered','rotated','revoked')),
 created_at timestamptz not null default now()
);
create index if not exists rim_e2e_devices_user_active_idx on public.rim_e2e_devices(user_id,last_seen_at desc) where status='active';
create index if not exists rim_e2e_otpk_available_idx on public.rim_e2e_one_time_prekeys(device_id,id) where consumed_at is null;
alter table public.rim_e2e_devices enable row level security;
alter table public.rim_e2e_signed_prekeys enable row level security;
alter table public.rim_e2e_one_time_prekeys enable row level security;
alter table public.rim_e2e_key_change_events enable row level security;
drop policy if exists rim_e2e_device_read_active on public.rim_e2e_devices;
create policy rim_e2e_device_read_active on public.rim_e2e_devices for select to authenticated using(status='active' or user_id=(select auth.uid()));
drop policy if exists rim_e2e_device_insert_owner on public.rim_e2e_devices;
create policy rim_e2e_device_insert_owner on public.rim_e2e_devices for insert to authenticated with check(user_id=(select auth.uid()));
drop policy if exists rim_e2e_device_update_owner on public.rim_e2e_devices;
create policy rim_e2e_device_update_owner on public.rim_e2e_devices for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_e2e_device_delete_owner on public.rim_e2e_devices;
create policy rim_e2e_device_delete_owner on public.rim_e2e_devices for delete to authenticated using(user_id=(select auth.uid()));
drop policy if exists rim_e2e_signed_prekey_read_active on public.rim_e2e_signed_prekeys;
create policy rim_e2e_signed_prekey_read_active on public.rim_e2e_signed_prekeys for select to authenticated using(exists(select 1 from public.rim_e2e_devices d where d.id=device_id and d.status='active'));
drop policy if exists rim_e2e_signed_prekey_insert_owner on public.rim_e2e_signed_prekeys;
create policy rim_e2e_signed_prekey_insert_owner on public.rim_e2e_signed_prekeys for insert to authenticated with check(exists(select 1 from public.rim_e2e_devices d where d.id=device_id and d.user_id=(select auth.uid())));
drop policy if exists rim_e2e_signed_prekey_update_owner on public.rim_e2e_signed_prekeys;
create policy rim_e2e_signed_prekey_update_owner on public.rim_e2e_signed_prekeys for update to authenticated using(exists(select 1 from public.rim_e2e_devices d where d.id=device_id and d.user_id=(select auth.uid()))) with check(exists(select 1 from public.rim_e2e_devices d where d.id=device_id and d.user_id=(select auth.uid())));
drop policy if exists rim_e2e_signed_prekey_delete_owner on public.rim_e2e_signed_prekeys;
create policy rim_e2e_signed_prekey_delete_owner on public.rim_e2e_signed_prekeys for delete to authenticated using(exists(select 1 from public.rim_e2e_devices d where d.id=device_id and d.user_id=(select auth.uid())));
drop policy if exists rim_e2e_otpk_owner_all on public.rim_e2e_one_time_prekeys;
create policy rim_e2e_otpk_owner_all on public.rim_e2e_one_time_prekeys for all to authenticated using(exists(select 1 from public.rim_e2e_devices d where d.id=device_id and d.user_id=(select auth.uid()))) with check(exists(select 1 from public.rim_e2e_devices d where d.id=device_id and d.user_id=(select auth.uid())));
drop policy if exists rim_e2e_key_events_owner_read on public.rim_e2e_key_change_events;
create policy rim_e2e_key_events_owner_read on public.rim_e2e_key_change_events for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.rim_e2e_devices,public.rim_e2e_signed_prekeys,public.rim_e2e_one_time_prekeys,public.rim_e2e_key_change_events from anon;
grant select,insert,update,delete on public.rim_e2e_devices,public.rim_e2e_signed_prekeys,public.rim_e2e_one_time_prekeys to authenticated;
grant select on public.rim_e2e_key_change_events to authenticated;

create or replace function public.rim_e2e_claim_prekey_bundle(p_target_user uuid,p_device_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_device public.rim_e2e_devices%rowtype; v_signed public.rim_e2e_signed_prekeys%rowtype; v_one public.rim_e2e_one_time_prekeys%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='28000'; end if;
 if p_target_user is null or p_target_user=auth.uid() then raise exception 'invalid_target_user' using errcode='22023'; end if;
 if exists(select 1 from public.user_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p_target_user) or (b.blocker_id=p_target_user and b.blocked_id=auth.uid())) then raise exception 'user_blocked' using errcode='42501'; end if;
 select * into v_device from public.rim_e2e_devices d where d.user_id=p_target_user and d.status='active' and (p_device_id is null or d.id=p_device_id) order by d.last_seen_at desc limit 1;
 if not found then return null; end if;
 select * into v_signed from public.rim_e2e_signed_prekeys s where s.device_id=v_device.id and s.expires_at>now();
 if not found then return null; end if;
 select * into v_one from public.rim_e2e_one_time_prekeys k where k.device_id=v_device.id and k.consumed_at is null order by k.id for update skip locked limit 1;
 if found then update public.rim_e2e_one_time_prekeys set consumed_at=now() where id=v_one.id; end if;
 return jsonb_build_object('device_id',v_device.id,'user_id',v_device.user_id,'identity_dh_public',v_device.identity_dh_public,'identity_sign_public',v_device.identity_sign_public,'fingerprint',v_device.fingerprint,'signed_prekey',jsonb_build_object('key_id',v_signed.key_id,'public_key',v_signed.public_key,'signature',v_signed.signature),'one_time_prekey',case when v_one.id is null then null else jsonb_build_object('key_id',v_one.key_id,'public_key',v_one.public_key) end);
end $$;
revoke all on function public.rim_e2e_claim_prekey_bundle(uuid,uuid) from public,anon;
grant execute on function public.rim_e2e_claim_prekey_bundle(uuid,uuid) to authenticated;
