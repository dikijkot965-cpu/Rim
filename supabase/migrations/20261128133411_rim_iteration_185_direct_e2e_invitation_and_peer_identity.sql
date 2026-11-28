-- Iteration 185 production reconciliation: durable acceptance state for secret direct chats.
-- This migration is already present in the linked production migration history.
-- The file is checked into source so fresh environments receive the same RPC contract.

create table if not exists public.rim_e2e_direct_invitation_acceptances (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.rim_e2e_direct_invitation_acceptances enable row level security;
drop policy if exists rim_e2e_direct_invitation_acceptances_read on public.rim_e2e_direct_invitation_acceptances;
create policy rim_e2e_direct_invitation_acceptances_read
  on public.rim_e2e_direct_invitation_acceptances
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.conversations c
      where c.id = rim_e2e_direct_invitation_acceptances.conversation_id
        and c.created_by = auth.uid()
    )
  );

revoke all on public.rim_e2e_direct_invitation_acceptances from anon, authenticated;
grant select on public.rim_e2e_direct_invitation_acceptances to authenticated;

create or replace function public.rim_e2e_get_direct_invitation_status(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_actor uuid := auth.uid();
  v_creator uuid;
  v_peer uuid;
  v_accepted_at timestamptz;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode = '28000'; end if;

  select c.created_by into v_creator
  from public.conversations c
  where c.id = p_conversation_id
    and c.type = 'direct'
    and c.is_secret is true
    and c.e2e_mode = 'required'
    and exists (
      select 1 from public.conversation_members mine
      where mine.conversation_id = c.id and mine.user_id = v_actor
    );
  if v_creator is null then raise exception 'secret_direct_conversation_not_found' using errcode = 'P0002'; end if;

  select m.user_id into v_peer
  from public.conversation_members m
  where m.conversation_id = p_conversation_id and m.user_id <> v_creator
  order by m.user_id limit 1;

  if v_peer is null
     or (select count(*) from public.conversation_members m where m.conversation_id = p_conversation_id) <> 2 then
    raise exception 'secret_direct_membership_invalid' using errcode = '22023';
  end if;
  if v_actor <> v_creator and v_actor <> v_peer then
    raise exception 'conversation_access_denied' using errcode = '42501';
  end if;

  select a.accepted_at into v_accepted_at
  from public.rim_e2e_direct_invitation_acceptances a
  where a.conversation_id = p_conversation_id and a.user_id = v_peer;

  return jsonb_build_object(
    'conversation_id', p_conversation_id,
    'created_by', v_creator,
    'peer_user_id', v_peer,
    'accepted', v_accepted_at is not null,
    'accepted_at', v_accepted_at
  );
end;
$function$;

create or replace function public.rim_e2e_accept_direct_invitation(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_actor uuid := auth.uid();
  v_creator uuid;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode = '28000'; end if;

  select c.created_by into v_creator
  from public.conversations c
  where c.id = p_conversation_id
    and c.type = 'direct'
    and c.is_secret is true
    and c.e2e_mode = 'required'
    and c.created_by <> v_actor
    and exists (
      select 1 from public.conversation_members mine
      where mine.conversation_id = c.id and mine.user_id = v_actor
    );
  if v_creator is null then raise exception 'direct_e2e_invitation_not_found' using errcode = 'P0002'; end if;

  if (select count(*) from public.conversation_members m where m.conversation_id = p_conversation_id) <> 2
     or not exists (
       select 1 from public.conversation_members peer
       where peer.conversation_id = p_conversation_id and peer.user_id = v_creator
     ) then
    raise exception 'secret_direct_membership_invalid' using errcode = '22023';
  end if;

  insert into public.rim_e2e_direct_invitation_acceptances(conversation_id, user_id)
  values (p_conversation_id, v_actor)
  on conflict (conversation_id, user_id) do nothing;

  return public.rim_e2e_get_direct_invitation_status(p_conversation_id);
end;
$function$;

revoke all on function public.rim_e2e_get_direct_invitation_status(uuid) from public, anon;
revoke all on function public.rim_e2e_accept_direct_invitation(uuid) from public, anon;
grant execute on function public.rim_e2e_get_direct_invitation_status(uuid) to authenticated;
grant execute on function public.rim_e2e_accept_direct_invitation(uuid) to authenticated;
