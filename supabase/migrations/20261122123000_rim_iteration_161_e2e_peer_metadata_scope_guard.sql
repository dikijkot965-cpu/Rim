-- Iteration 161: restrict peer device and public identity metadata to shared scopes.
create or replace function public.rim_e2e_users_share_scope(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_a is not null and p_user_b is not null and p_user_a <> p_user_b and (
    exists (
      select 1
      from public.conversations c
      join public.conversation_members a on a.conversation_id = c.id and a.user_id = p_user_a
      join public.conversation_members b on b.conversation_id = c.id and b.user_id = p_user_b
      where c.type = 'direct' or (c.type = 'group' and c.is_private is true)
    )
    or exists (
      select 1
      from public.channels ch
      join public.channel_members a on a.channel_id = ch.id and a.user_id = p_user_a
      join public.channel_members b on b.channel_id = ch.id and b.user_id = p_user_b
      where ch.is_public is false
    )
  );
$$;
revoke all on function public.rim_e2e_users_share_scope(uuid,uuid) from public, anon, authenticated;
grant execute on function public.rim_e2e_users_share_scope(uuid,uuid) to service_role;
