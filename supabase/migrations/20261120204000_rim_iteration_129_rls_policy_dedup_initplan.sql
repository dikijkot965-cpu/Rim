-- Remove exact duplicate permissive policies. The retained policies have identical
-- roles, commands, USING expressions and WITH CHECK expressions.
drop policy if exists achievements_read on public.achievements;
drop policy if exists app_notifications_own_read on public.app_notifications;
drop policy if exists app_notifications_own_update on public.app_notifications;
drop policy if exists bulletin_delete on public.bulletin_posts;
drop policy if exists bulletin_insert on public.bulletin_posts;
drop policy if exists bulletin_read on public.bulletin_posts;
drop policy if exists channel_comments_delete on public.channel_post_comments;
drop policy if exists channel_comments_insert on public.channel_post_comments;
drop policy if exists channel_comments_read on public.channel_post_comments;
drop policy if exists channel_comments_update on public.channel_post_comments;
drop policy if exists channel_wallpapers_read on public.channel_wallpapers;
drop policy if exists "Users can add own music" on public.music_tracks;
drop policy if exists "Users can delete own music" on public.music_tracks;
drop policy if exists "Users can view own music" on public.music_tracks;

do $$
declare r record; v_qual text; v_check text;
begin
  for r in select schemaname,tablename,policyname,qual,with_check from pg_policies
    where schemaname='public' and (
      (coalesce(qual,'') ilike '%auth.uid()%' and lower(coalesce(qual,'')) not like '%select auth.uid()%')
      or (coalesce(with_check,'') ilike '%auth.uid()%' and lower(coalesce(with_check,'')) not like '%select auth.uid()%')
    )
  loop
    v_qual:=r.qual; v_check:=r.with_check;
    if v_qual is not null and lower(v_qual) like '%auth.uid()%' and lower(v_qual) not like '%select auth.uid()%' then
      v_qual:=replace(v_qual,'auth.uid()','(select auth.uid())');
    end if;
    if v_check is not null and lower(v_check) like '%auth.uid()%' and lower(v_check) not like '%select auth.uid()%' then
      v_check:=replace(v_check,'auth.uid()','(select auth.uid())');
    end if;
    if v_qual is not null and v_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',r.policyname,r.schemaname,r.tablename,v_qual,v_check);
    elsif v_qual is not null then
      execute format('alter policy %I on %I.%I using (%s)',r.policyname,r.schemaname,r.tablename,v_qual);
    elsif v_check is not null then
      execute format('alter policy %I on %I.%I with check (%s)',r.policyname,r.schemaname,r.tablename,v_check);
    end if;
  end loop;
end $$;
