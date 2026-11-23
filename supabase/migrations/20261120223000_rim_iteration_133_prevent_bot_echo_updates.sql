create or replace function private.rim_capture_bot_message()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private
as $$
declare v_bot record; v_update_id bigint;
begin
  for v_bot in
    select b.id from public.rim_bots b
    join public.conversation_members cm on cm.user_id=b.bot_user_id and cm.conversation_id=new.conversation_id
    where b.is_active=true and b.bot_user_id<>new.sender_id
      and not exists(select 1 from public.rim_bots sender_bot where sender_bot.bot_user_id=new.sender_id)
  loop
    insert into public.rim_bot_updates(bot_id,update_type,payload)
    values(v_bot.id,'message',jsonb_build_object('message',jsonb_build_object(
      'message_id',new.id,'chat_id',new.conversation_id,'from_user_id',new.sender_id,'text',new.body,'date',new.created_at
    ))) returning id into v_update_id;
    update public.rim_bot_updates set payload=jsonb_set(payload,'{update_id}',to_jsonb(v_update_id),true) where id=v_update_id;
  end loop;
  return new;
end; $$;
revoke all on function private.rim_capture_bot_message() from public,anon,authenticated;
