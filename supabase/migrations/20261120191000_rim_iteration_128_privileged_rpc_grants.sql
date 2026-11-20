-- RIM iteration 128: remove anonymous/public EXECUTE from privileged RPCs.
-- These routines are used by signed-in app clients or internal triggers; no anonymous
-- Data API caller should invoke them directly. RLS helper functions retain authenticated
-- EXECUTE because policies call them for signed-in requests.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.app_cancel_friend_request(uuid)',
    'public.app_record_spam_event(text,jsonb)',
    'public.app_respond_friend_request(uuid,text)',
    'public.can_access_channel(uuid)',
    'public.can_post_to_channel(uuid)',
    'public.create_group_chat(text,uuid[])',
    'public.start_direct_chat(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.award_channel_creator()',
    'public.award_first_channel_comment()',
    'public.award_first_channel_post()',
    'public.notify_channel_comment_created()',
    'public.notify_channel_post_created()',
    'public.rim_reject_blocked_direct_message()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
end $$;
