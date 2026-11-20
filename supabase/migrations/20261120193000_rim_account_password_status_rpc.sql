create or replace function public.rim_account_has_password(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = p_user_id
      and coalesce(u.encrypted_password, '') <> ''
  );
$$;
revoke all on function public.rim_account_has_password(uuid) from public, anon, authenticated;
grant execute on function public.rim_account_has_password(uuid) to service_role;
