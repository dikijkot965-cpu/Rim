drop policy if exists "Public groups are discoverable" on public.conversations;
create policy "Public groups are discoverable"
on public.conversations
for select
to authenticated
using (type='group' and is_private=false);

create or replace function public.rim_group_join_public(p_conversation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_group public.conversations%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Требуется вход в РИМ.' using errcode='42501';
  end if;
  if p_conversation_id is null then
    raise exception 'Не указана группа.';
  end if;

  select * into v_group
  from public.conversations
  where id=p_conversation_id and type='group'
  for update;

  if not found then
    raise exception 'Группа не найдена или недоступна.';
  end if;
  if v_group.is_private then
    raise exception 'Это закрытая группа. Для вступления нужна ссылка-приглашение.';
  end if;
  if coalesce(v_group.e2e_mode,'off') in ('pending','required') then
    raise exception 'Вступление в публичную группу с активируемым E2E недоступно.';
  end if;
  if exists (
    select 1 from public.rim_zladen_bans
    where conversation_id=p_conversation_id and user_id=v_user_id
  ) then
    raise exception 'Вам запрещено вступать в эту группу.';
  end if;

  insert into public.conversation_members(conversation_id,user_id,role)
  values(p_conversation_id,v_user_id,'member')
  on conflict(conversation_id,user_id) do nothing;

  return p_conversation_id;
end;
$$;

revoke all on function public.rim_group_join_public(uuid) from public, anon;
grant execute on function public.rim_group_join_public(uuid) to authenticated;

comment on function public.rim_group_join_public(uuid) is
  'Idempotently joins a discoverable public group after checking privacy, E2E state and group bans.';
