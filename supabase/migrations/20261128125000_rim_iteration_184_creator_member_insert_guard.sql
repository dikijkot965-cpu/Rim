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
    or (
      user_id <> auth.uid()
      and role = 'member'
      and exists (
        select 1
        from public.conversation_members owner_member
        where owner_member.conversation_id = conversation_id
          and owner_member.user_id = auth.uid()
          and owner_member.role = 'owner'
      )
    )
  )
);

comment on policy conversation_members_group_owner_insert on public.conversation_members is
  'The creator may claim the initial owner membership; invite rows require the creator to still hold owner membership. The restrictive seed-session gate remains in force.';
