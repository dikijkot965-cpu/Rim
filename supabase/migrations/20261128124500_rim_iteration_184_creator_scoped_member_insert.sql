drop policy if exists conversation_members_group_owner_insert on public.conversation_members;
create policy conversation_members_group_owner_insert
on public.conversation_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.type = 'group'
      and c.created_by = auth.uid()
  )
  and (
    (user_id = auth.uid() and role = 'owner')
    or (user_id <> auth.uid() and role = 'member')
  )
);

comment on policy conversation_members_group_owner_insert on public.conversation_members is
  'Only the authenticated creator of a group may claim its owner row and add ordinary members during creation; the restrictive seed-session gate remains in force.';
