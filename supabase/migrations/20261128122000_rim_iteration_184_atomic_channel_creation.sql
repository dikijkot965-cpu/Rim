create or replace function public.rim_create_channel(
  p_title text,
  p_description text default '',
  p_username text default null,
  p_is_public boolean default true,
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
  v_description text := trim(coalesce(p_description, ''));
  v_username text := nullif(lower(trim(coalesce(p_username, ''))), '');
  v_channel_id uuid;
begin
  if v_user_id is null then
    raise exception 'Требуется вход в РИМ.' using errcode = '42501';
  end if;
  if char_length(v_title) not between 1 and 80 then
    raise exception 'Название канала должно содержать от 1 до 80 символов.';
  end if;
  if char_length(v_description) > 1000 then
    raise exception 'Описание канала не должно превышать 1000 символов.';
  end if;
  if v_username is not null and v_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Username канала должен содержать 3–24 символа: латинские буквы, цифры и подчёркивание.';
  end if;
  if p_avatar_path is not null
     and p_avatar_path !~ ('^' || v_user_id::text || '/channels/[A-Za-z0-9._-]{1,180}$') then
    raise exception 'Недопустимый путь аватара канала.' using errcode = '42501';
  end if;

  insert into public.channels (
    title, description, owner_id, is_public, catalog_visible, username, avatar_path
  )
  values (
    v_title, v_description, v_user_id, coalesce(p_is_public, true),
    coalesce(p_is_public, true), v_username, p_avatar_path
  )
  returning id into v_channel_id;

  insert into public.channel_members (channel_id, user_id, role)
  values (v_channel_id, v_user_id, 'admin');

  return v_channel_id;
end;
$$;

revoke all on function public.rim_create_channel(text, text, text, boolean, text) from public, anon;
grant execute on function public.rim_create_channel(text, text, text, boolean, text) to authenticated;

comment on function public.rim_create_channel(text, text, text, boolean, text) is
  'Atomically creates a public/private channel, exposes public channels in the catalog and assigns the creator as admin.';
