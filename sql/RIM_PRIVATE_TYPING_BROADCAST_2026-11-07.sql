-- Applied to Supabase project xxvcsaomkyknudoaixbs as migration rim_private_typing_broadcast_20261107.
-- Realtime typing broadcasts are private and accessible only to authenticated members
-- of the conversation encoded in the rim-typing-<conversation UUID> topic.

create policy "rim_typing_conversation_members_receive"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and exists (
    select 1 from public.conversation_members cm
    where cm.user_id = (select auth.uid())
      and cm.conversation_id::text = substring(realtime.topic() from '^rim-typing-([0-9a-fA-F-]{36})$')
  )
);

create policy "rim_typing_conversation_members_send"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'broadcast'
  and exists (
    select 1 from public.conversation_members cm
    where cm.user_id = (select auth.uid())
      and cm.conversation_id::text = substring(realtime.topic() from '^rim-typing-([0-9a-fA-F-]{36})$')
  )
);
