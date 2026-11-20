-- The current RLS policies that call these helpers are all scoped to authenticated.
-- Anonymous callers do not need EXECUTE, so remove the inherited PUBLIC grant as well.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.app_can_manage_channel(uuid)',
    'public.app_can_post_channel(uuid)',
    'public.app_can_view_channel(uuid)',
    'public.app_can_view_feed_post(uuid)',
    'public.app_can_view_user_content(uuid,text)',
    'public.app_is_channel_member(uuid)',
    'public.app_is_conversation_member(uuid)',
    'public.app_is_imperator()',
    'public.can_access_music_track(uuid)',
    'public.can_manage_channel(uuid)',
    'public.has_app_permission(text)',
    'public.is_conversation_member(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
