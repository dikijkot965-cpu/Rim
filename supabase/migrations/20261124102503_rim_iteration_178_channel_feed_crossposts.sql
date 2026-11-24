-- Iteration 178: durable, deduplicated channel-post cross-posts into the home feed.
alter table public.feed_posts add column if not exists source_channel_id uuid, add column if not exists source_channel_post_id uuid;
create unique index if not exists feed_posts_source_channel_post_unique on public.feed_posts(source_channel_post_id) where source_channel_post_id is not null;
create index if not exists feed_posts_source_channel_idx on public.feed_posts(source_channel_id,created_at desc) where source_channel_id is not null;
create or replace function private.rim_guard_feed_channel_crosspost()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,auth,private as $$
declare v_owner uuid;v_is_public boolean;v_role text;
begin
 if new.source_channel_id is null and new.source_channel_post_id is null then return new;end if;
 if new.source_channel_id is null or new.source_channel_post_id is null then raise exception 'feed_channel_source_incomplete' using errcode='22023';end if;
 if auth.uid() is null or new.author_id is distinct from auth.uid() then raise exception 'feed_channel_source_auth_required' using errcode='42501';end if;
 select c.owner_id,c.is_public into v_owner,v_is_public from public.channels c where c.id=new.source_channel_id;
 if not found or v_is_public is not true then raise exception 'feed_channel_source_must_be_public' using errcode='42501';end if;
 select m.role into v_role from public.channel_members m where m.channel_id=new.source_channel_id and m.user_id=new.author_id limit 1;
 if new.author_id is distinct from v_owner and coalesce(v_role,'') not in ('admin','moderator') then raise exception 'feed_channel_source_manager_required' using errcode='42501';end if;
 if not exists(select 1 from public.channel_posts p where p.id=new.source_channel_post_id and p.channel_id=new.source_channel_id) then raise exception 'feed_channel_source_post_not_found' using errcode='P0002';end if;
 return new;
end;
$$;
revoke all on function private.rim_guard_feed_channel_crosspost() from public,anon,authenticated;
drop trigger if exists rim_guard_feed_channel_crosspost on public.feed_posts;
create trigger rim_guard_feed_channel_crosspost before insert or update of source_channel_id,source_channel_post_id,author_id on public.feed_posts for each row execute function private.rim_guard_feed_channel_crosspost();
comment on column public.feed_posts.source_channel_id is 'Origin public channel for a manager-authorized cross-post.';
comment on column public.feed_posts.source_channel_post_id is 'Origin channel_posts.id; unique to prevent duplicate cross-posts.';
