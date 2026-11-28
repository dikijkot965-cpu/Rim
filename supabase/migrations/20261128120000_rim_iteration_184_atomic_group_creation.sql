create or replace function public.rim_create_group_chat(
  p_title text,
  p_invited_users uuid[] default array[]::uuid[],
  p_is_private boolean default true,
  p_avatar_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := trim(coalesce(p_title, ''));
  v_conversation_id uuid;
  v_invited uuid;
  v_invites uuid[] := coalesce(p_invited_users, array[]::uuid[]);
begin
  if v_user_id is null then
    raise exception 'Требуется вход в РИМ.' using errcode = '42501';
  end if;
  if char_length(v_title) not between 1 and 60 then
    raise exception 'Название группы должно содержать от 1 до 60 символов.';
  end if;
  if cardinality(v_invites) > 49 then
    raise exception 'Максимум 49 приглашённых пользователей.';
  end if;
  if p_avatar_path is not null
     and p_avatar_path !~ ('^' || v_user_id::text || '/groups/[A-Za-z0-9._-]{1,180}$') then
    raise exception 'Недопустимый путь аватара группы.' using errcode = '42501';
  end if;
  if exists (
    select 1
    from unnest(v_invites) as invited(user_id)
    where invited.user_id is not null
      and invited.user_id <> v_user_id
      and not exists (select 1 from public.profiles p where p.id = invited.user_id)
  ) then
    raise exception 'Один из приглашённых пользователей не найден.';
  end if;

  insert into public.conversations (type, title, created_by, is_private, avatar_path)
  values ('group', v_title, v_user_id, coalesce(p_is_private, true), p_avatar_path)
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, v_user_id, 'owner');

  for v_invited in
    select distinct invited.user_id
    from unnest(v_invites) as invited(user_id)
    where invited.user_id is not null and invited.user_id <> v_user_id
  loop
    insert into public.conversation_members (conversation_id, user_id, role)
    values (v_conversation_id, v_invited, 'member')
    on conflict (conversation_id, user_id) do nothing;
  end loop;

  return v_conversation_id;
end;
$$;

revoke all on function public.rim_create_group_chat(text, uuid[], boolean, text) from public, anon;
grant execute on function public.rim_create_group_chat(text, uuid[], boolean, text) to authenticated;

comment on function public.rim_create_group_chat(text, uuid[], boolean, text) is
  'Atomically creates a group, records its creator, assigns owner role, applies privacy/avatar and invites validated members.';
