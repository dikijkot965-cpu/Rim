drop trigger if exists a_rim_zladen_help_detail on public.chat_messages;
drop trigger if exists zz_rim_zladen_help_detail on public.chat_messages;
create trigger zz_rim_zladen_help_detail
before insert on public.chat_messages
for each row execute function private.rim_zladen_help_detail();
comment on trigger zz_rim_zladen_help_detail on public.chat_messages is
  'Runs after message validation, encryption, block and moderation guards; handles command-specific Zladen help.';
