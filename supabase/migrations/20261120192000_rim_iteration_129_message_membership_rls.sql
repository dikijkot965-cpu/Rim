-- Require active conversation membership for edits and deletes.
drop policy if exists "Authors can delete own messages" on public.chat_messages;
create policy "Authors can delete own messages"
on public.chat_messages for delete to authenticated
using (sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id));

drop policy if exists "Authors can edit own messages" on public.chat_messages;
create policy "Authors can edit own messages"
on public.chat_messages for update to authenticated
using (sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id))
with check (sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id));
