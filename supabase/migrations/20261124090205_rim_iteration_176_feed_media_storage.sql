-- Iteration 176: private media storage for the social feed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feed-media',
  'feed-media',
  false,
  26214400,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/webm','video/quicktime',
    'audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm',
    'application/pdf','text/plain'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists feed_media_owner_insert on storage.objects;
create policy feed_media_owner_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'feed-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists feed_media_owner_delete on storage.objects;
create policy feed_media_owner_delete on storage.objects
for delete to authenticated
using (bucket_id = 'feed-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists feed_media_visible_read on storage.objects;
create policy feed_media_visible_read on storage.objects
for select to authenticated
using (
  bucket_id = 'feed-media'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.rim_feed_post_media m
      join public.feed_posts p on p.id = m.post_id
      where m.storage_path = objects.name and p.deleted_at is null
        and public.app_can_view_feed_post(m.post_id)
    )
  )
);

drop policy if exists rim_feed_media_read on public.rim_feed_post_media;
create policy rim_feed_media_read on public.rim_feed_post_media
for select to authenticated
using (
  exists (
    select 1 from public.feed_posts p
    where p.id = rim_feed_post_media.post_id
      and p.deleted_at is null and public.app_can_view_feed_post(p.id)
  )
);

drop policy if exists rim_feed_media_owner_delete on public.rim_feed_post_media;
create policy rim_feed_media_owner_delete on public.rim_feed_post_media
for delete to authenticated
using (
  owner_id = (select auth.uid())
  and exists (select 1 from public.feed_posts p where p.id = rim_feed_post_media.post_id and p.author_id = (select auth.uid()))
);

create index if not exists rim_feed_post_media_post_sort_idx
on public.rim_feed_post_media (post_id, sort_order, created_at);
