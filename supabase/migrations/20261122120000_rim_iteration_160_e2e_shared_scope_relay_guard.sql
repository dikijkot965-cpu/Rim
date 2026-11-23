-- Iteration 160: enforce shared-scope membership at the database write boundary.
-- Relay RPCs run as service_role, so application-side auth alone is insufficient.

create or replace function public.rim_e2e_assert_shared_scope_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sender uuid;
  v_target uuid;
begin
  if tg_table_name = 'rim_e2e_relay_prekey_fetch_limits' then
    v_sender := new.requester_user_id;
    v_target := new.target_user_id;
  elsif tg_table_name = 'rim_e2e_relay_envelopes' then
    v_sender := new.sender_user_id;
    v_target := new.target_user_id;
  else
    raise exception 'unsupported_e2e_scope_guard_table' using errcode='0A000';
  end if;

  if v_sender is null or v_target is null or v_sender = v_target then
    raise exception 'invalid_e2e_scope_membership' using errcode='22023';
  end if;

  if not (
    exists (
      select 1
      from public.conversations c
      join public.conversation_members s on s.conversation_id = c.id and s.user_id = v_sender
      join public.conversation_members t on t.conversation_id = c.id and t.user_id = v_target
      where c.type = 'direct' or (c.type = 'group' and c.is_private is true)
    )
    or exists (
      select 1
      from public.channels ch
      join public.channel_members s on s.channel_id = ch.id and s.user_id = v_sender
      join public.channel_members t on t.channel_id = ch.id and t.user_id = v_target
      where ch.is_public is false
    )
  ) then
    raise exception 'shared_e2e_scope_required' using errcode='42501';
  end if;

  return new;
end;
$$;

revoke all on function public.rim_e2e_assert_shared_scope_membership() from public, anon, authenticated;

 drop trigger if exists rim_e2e_prekey_shared_scope_guard on public.rim_e2e_relay_prekey_fetch_limits;
create trigger rim_e2e_prekey_shared_scope_guard
before insert on public.rim_e2e_relay_prekey_fetch_limits
for each row execute function public.rim_e2e_assert_shared_scope_membership();

 drop trigger if exists rim_e2e_envelope_shared_scope_guard on public.rim_e2e_relay_envelopes;
create trigger rim_e2e_envelope_shared_scope_guard
before insert on public.rim_e2e_relay_envelopes
for each row execute function public.rim_e2e_assert_shared_scope_membership();
