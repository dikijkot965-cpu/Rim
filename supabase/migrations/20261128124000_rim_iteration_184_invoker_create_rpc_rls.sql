alter function public.rim_create_group_chat(text, uuid[], boolean, text) security invoker;
alter function public.rim_create_channel(text, text, text, boolean, text) security invoker;

drop policy if exists conversations_group_creator_insert on public.conversations;
create policy conversations_group_creator_insert
on public.conversations
for insert
to authenticated
with check (
  type = 'group'
  and created_by = auth.uid()
);

drop policy if exists conversations_group_creator_read on public.conversations;
create policy conversations_group_creator_read
on public.conversations
for select
to authenticated
using (
  type = 'group'
  and created_by = auth.uid()
);

drop policy if exists conversation_members_group_owner_insert on public.conversation_members;
create policy conversation_members_group_owner_insert
on public.conversation_members
for insert
to authenticated
with check (
  public.rim_group_can_manage(conversation_id)
  and (
    (user_id = auth.uid() and role = 'owner')
    or (user_id <> auth.uid() and role = 'member')
  )
);

revoke all on function public.create_group_chat(text, uuid[]) from public, anon, authenticated;

comment on policy conversations_group_creator_insert on public.conversations is
  'Authenticated users may create only group conversations attributed to their own auth.uid().';
comment on policy conversation_members_group_owner_insert on public.conversation_members is
  'A group creator/manager may claim the owner row and add ordinary members; the restrictive seed-session gate remains in force.';
