-- RIM iteration 135: additive bot workspace/runtime metadata + social feed foundation.
-- Safe to apply to an existing production database: no existing rows are deleted.
create extension if not exists pgcrypto;

-- BOT PROJECTS: source code is data, never executed inside the RIM web page or Edge Function.
create table if not exists public.rim_bot_projects (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null unique references public.rim_bots(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Основной проект',
  entry_file text not null default 'index.js',
  runtime_state text not null default 'draft' check (runtime_state in ('draft','queued','starting','running','stopped','error','suspended')),
  runtime_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, owner_id)
);
create table if not exists public.rim_bot_project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.rim_bot_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  language text not null default 'javascript',
  content text not null default '',
  byte_length bigint generated always as (octet_length(content)) stored,
  updated_at timestamptz not null default now(),
  unique(project_id,path)
);
create table if not exists public.rim_bot_project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.rim_bot_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  version bigint not null,
  manifest jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(project_id,version)
);
create table if not exists public.rim_bot_runtime_state (
  bot_id uuid primary key references public.rim_bots(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  desired_state text not null default 'stopped' check (desired_state in ('running','stopped')),
  actual_state text not null default 'unavailable' check (actual_state in ('unavailable','queued','starting','running','stopped','error','suspended')),
  runtime_instance text,
  deployed_version bigint not null default 0,
  heartbeat_at timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now()
);
create table if not exists public.rim_bot_runtime_logs (
  id bigint generated always as identity primary key,
  bot_id uuid not null references public.rim_bots(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  level text not null default 'info' check (level in ('debug','info','warn','error')),
  event text not null,
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rim_bot_project_files_project_idx on public.rim_bot_project_files(project_id,path);
create index if not exists rim_bot_project_versions_recent_idx on public.rim_bot_project_versions(project_id,version desc);
create index if not exists rim_bot_runtime_logs_recent_idx on public.rim_bot_runtime_logs(bot_id,created_at desc);

-- A project is automatically created for each bot on first save by the client.
alter table public.rim_bots add column if not exists avatar_path text;
alter table public.rim_bots add column if not exists short_description text not null default '';

-- SOCIAL FEED / PERSONALIZATION FOUNDATION. Existing feed_posts and social tables remain intact.
alter table public.feed_posts add column if not exists title text not null default '';
alter table public.feed_posts add column if not exists content_format text not null default 'plain' check (content_format in ('plain','markdown','rich'));
alter table public.feed_posts add column if not exists language_code text not null default 'ru';
alter table public.feed_posts add column if not exists topic_ids uuid[] not null default '{}';
alter table public.feed_posts add column if not exists published_at timestamptz;
alter table public.feed_posts add column if not exists edited_version integer not null default 1;
alter table public.feed_posts add column if not exists is_pinned boolean not null default false;
alter table public.feed_posts add column if not exists content_labels text[] not null default '{}';
alter table public.feed_posts add column if not exists deleted_at timestamptz;
create index if not exists feed_posts_public_timeline_idx on public.feed_posts(published_at desc nulls last,id desc) where deleted_at is null and visibility='public';
create index if not exists feed_posts_author_timeline_idx on public.feed_posts(author_id,created_at desc,id desc);
create index if not exists feed_posts_topics_gin_idx on public.feed_posts using gin(topic_ids);

create table if not exists public.rim_feed_topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  parent_id uuid references public.rim_feed_topics(id) on delete set null,
  name_key text not null,
  description_key text,
  icon text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.rim_feed_topics(slug,name_key,description_key,icon,sort_order) values
('history','feed.topic.history','feed.topic.history.description','🏛️',10),('technology','feed.topic.technology','feed.topic.technology.description','💻',20),
('science','feed.topic.science','feed.topic.science.description','🔬',30),('culture','feed.topic.culture','feed.topic.culture.description','🎭',40),
('education','feed.topic.education','feed.topic.education.description','📚',50),('gaming','feed.topic.gaming','feed.topic.gaming.description','🎮',60),
('travel','feed.topic.travel','feed.topic.travel.description','🧭',70),('nature','feed.topic.nature','feed.topic.nature.description','🌿',80),
('sports','feed.topic.sports','feed.topic.sports.description','⚽',90),('music','feed.topic.music','feed.topic.music.description','🎵',100),
('photography','feed.topic.photography','feed.topic.photography.description','📷',110),('news','feed.topic.news','feed.topic.news.description','📰',120),
('business','feed.topic.business','feed.topic.business.description','📈',130),('art','feed.topic.art','feed.topic.art.description','🎨',140)
on conflict(slug) do nothing;

create table if not exists public.rim_feed_post_topics (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  topic_id uuid not null references public.rim_feed_topics(id) on delete cascade,
  confidence numeric(5,4),
  source text not null default 'author' check(source in ('author','classifier','moderator')),
  created_at timestamptz not null default now(),
  primary key(post_id,topic_id)
);
create table if not exists public.rim_feed_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  media_type text not null check(media_type in ('image','video','audio','document')),
  mime_type text,
  byte_size bigint,
  width integer,
  height integer,
  duration_ms integer,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.rim_feed_post_saves (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_name text not null default 'saved',
  created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);
create table if not exists public.rim_feed_post_views (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  viewer_id uuid references auth.users(id) on delete set null,
  anonymous_key_hash text,
  viewed_at timestamptz not null default now(),
  dwell_ms integer not null default 0 check(dwell_ms>=0),
  source text not null default 'home',
  check(viewer_id is not null or anonymous_key_hash is not null)
);
create table if not exists public.rim_feed_post_reactions (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);
create table if not exists public.rim_feed_post_reposts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  commentary text not null default '',
  created_at timestamptz not null default now(),
  unique(post_id,user_id)
);
create table if not exists public.rim_feed_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text not null default '',
  status text not null default 'open' check(status in ('open','reviewing','resolved','rejected')),
  created_at timestamptz not null default now(),
  unique(post_id,reporter_id)
);
create table if not exists public.rim_feed_post_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  media_manifest jsonb not null default '[]'::jsonb,
  visibility text not null default 'public',
  language_code text not null default 'ru',
  updated_at timestamptz not null default now()
);
create table if not exists public.rim_feed_post_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.feed_posts(id) on delete set null,
  payload jsonb not null,
  publish_at timestamptz not null,
  status text not null default 'queued' check(status in ('queued','publishing','published','cancelled','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.rim_feed_hashtags (
  id uuid primary key default gen_random_uuid(),
  normalized_tag text not null unique,
  display_tag text not null,
  post_count bigint not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.rim_feed_post_hashtags (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  hashtag_id uuid not null references public.rim_feed_hashtags(id) on delete cascade,
  primary key(post_id,hashtag_id)
);
create table if not exists public.rim_feed_post_mentions (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id,mentioned_user_id)
);

-- Preferences are explicit user-owned data, not inferred sensitive profiles.
create table if not exists public.rim_user_feed_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  feed_mode text not null default 'recommended' check(feed_mode in ('recommended','following','chronological')),
  language_codes text[] not null default array['ru']::text[],
  autoplay_video boolean not null default false,
  hide_sensitive_content boolean not null default true,
  show_reposts boolean not null default true,
  personalization_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.rim_user_topic_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references public.rim_feed_topics(id) on delete cascade,
  preference numeric(5,2) not null default 0 check(preference between -100 and 100),
  source text not null default 'user' check(source in ('user','implicit','imported')),
  updated_at timestamptz not null default now(),
  primary key(user_id,topic_id)
);
create table if not exists public.rim_user_feed_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  post_id uuid references public.feed_posts(id) on delete cascade,
  event_type text not null check(event_type in ('impression','open','like','comment','share','save','hide','report','follow_author','dwell')),
  source text not null default 'home',
  dwell_ms integer,
  event_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.rim_feed_impressions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  ranking_version text not null default 'baseline',
  position integer not null,
  source text not null default 'home',
  created_at timestamptz not null default now(),
  unique(user_id,post_id,ranking_version,created_at)
);
create table if not exists public.rim_feed_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  is_private boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id,title)
);
create table if not exists public.rim_feed_collection_items (
  collection_id uuid not null references public.rim_feed_collections(id) on delete cascade,
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key(collection_id,post_id)
);
create table if not exists public.rim_user_muted_topics (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references public.rim_feed_topics(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,topic_id)
);
create table if not exists public.rim_user_muted_authors (
  user_id uuid not null references auth.users(id) on delete cascade,
  muted_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,muted_user_id),
  check(user_id<>muted_user_id)
);
create table if not exists public.rim_user_profile_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme_id text not null default 'imperial-dark',
  language_code text not null default 'ru',
  timezone text not null default 'UTC',
  date_format text not null default 'locale',
  number_format text not null default 'locale',
  accessibility jsonb not null default '{}'::jsonb,
  interface_preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists rim_feed_post_topics_topic_idx on public.rim_feed_post_topics(topic_id,post_id);
create index if not exists rim_feed_media_post_idx on public.rim_feed_post_media(post_id,sort_order);
create index if not exists rim_feed_saves_user_idx on public.rim_feed_post_saves(user_id,created_at desc);
create index if not exists rim_feed_views_post_idx on public.rim_feed_post_views(post_id,viewed_at desc);
create index if not exists rim_feed_reactions_post_idx on public.rim_feed_post_reactions(post_id,reaction);
create index if not exists rim_feed_events_user_idx on public.rim_user_feed_events(user_id,created_at desc);
create index if not exists rim_feed_events_post_idx on public.rim_user_feed_events(post_id,event_type,created_at desc);
create index if not exists rim_feed_impressions_user_idx on public.rim_feed_impressions(user_id,created_at desc);
create index if not exists rim_feed_schedule_due_idx on public.rim_feed_post_schedule(publish_at) where status='queued';
create index if not exists rim_feed_hashtags_popular_idx on public.rim_feed_hashtags(post_count desc);

-- RLS: bot owners may edit only their own source; runtime tables are server-write-only.
alter table public.rim_bot_projects enable row level security;
alter table public.rim_bot_project_files enable row level security;
alter table public.rim_bot_project_versions enable row level security;
alter table public.rim_bot_runtime_state enable row level security;
alter table public.rim_bot_runtime_logs enable row level security;
drop policy if exists rim_bot_projects_owner_all on public.rim_bot_projects;
create policy rim_bot_projects_owner_all on public.rim_bot_projects for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and exists(select 1 from public.rim_bots b where b.id=bot_id and b.owner_id=(select auth.uid())));
drop policy if exists rim_bot_project_files_owner_all on public.rim_bot_project_files;
create policy rim_bot_project_files_owner_all on public.rim_bot_project_files for all to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.rim_bot_projects p where p.id=project_id and p.owner_id=(select auth.uid()))) with check(owner_id=(select auth.uid()) and exists(select 1 from public.rim_bot_projects p where p.id=project_id and p.owner_id=(select auth.uid())));
drop policy if exists rim_bot_project_versions_owner_read on public.rim_bot_project_versions;
create policy rim_bot_project_versions_owner_read on public.rim_bot_project_versions for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists rim_bot_runtime_state_owner_read on public.rim_bot_runtime_state;
create policy rim_bot_runtime_state_owner_read on public.rim_bot_runtime_state for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists rim_bot_runtime_logs_owner_read on public.rim_bot_runtime_logs;
create policy rim_bot_runtime_logs_owner_read on public.rim_bot_runtime_logs for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.rim_bot_projects,public.rim_bot_project_files,public.rim_bot_project_versions,public.rim_bot_runtime_state,public.rim_bot_runtime_logs from anon;
grant select,insert,update,delete on public.rim_bot_projects,public.rim_bot_project_files to authenticated;
grant select on public.rim_bot_project_versions,public.rim_bot_runtime_state,public.rim_bot_runtime_logs to authenticated;

-- RLS: user-owned feed preferences, drafts, saves, reactions, collections, and events.
DO $$
declare t text;
begin
 foreach t in array array['rim_feed_post_saves','rim_feed_post_reactions','rim_feed_post_reposts','rim_feed_post_reports','rim_feed_post_drafts','rim_feed_post_schedule','rim_user_feed_preferences','rim_user_topic_preferences','rim_user_feed_events','rim_feed_impressions','rim_feed_collections','rim_feed_collection_items','rim_user_muted_topics','rim_user_muted_authors','rim_user_profile_preferences'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
drop policy if exists rim_feed_saves_owner_all on public.rim_feed_post_saves;
create policy rim_feed_saves_owner_all on public.rim_feed_post_saves for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_feed_reactions_owner_all on public.rim_feed_post_reactions;
create policy rim_feed_reactions_owner_all on public.rim_feed_post_reactions for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_feed_reposts_owner_all on public.rim_feed_post_reposts;
create policy rim_feed_reposts_owner_all on public.rim_feed_post_reposts for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_feed_reports_owner_insert on public.rim_feed_post_reports;
create policy rim_feed_reports_owner_insert on public.rim_feed_post_reports for insert to authenticated with check(reporter_id=(select auth.uid()));
drop policy if exists rim_feed_reports_owner_read on public.rim_feed_post_reports;
create policy rim_feed_reports_owner_read on public.rim_feed_post_reports for select to authenticated using(reporter_id=(select auth.uid()));
drop policy if exists rim_feed_drafts_owner_all on public.rim_feed_post_drafts;
create policy rim_feed_drafts_owner_all on public.rim_feed_post_drafts for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_feed_schedule_owner_all on public.rim_feed_post_schedule;
create policy rim_feed_schedule_owner_all on public.rim_feed_post_schedule for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_user_feed_preferences_owner_all on public.rim_user_feed_preferences;
create policy rim_user_feed_preferences_owner_all on public.rim_user_feed_preferences for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_user_topic_preferences_owner_all on public.rim_user_topic_preferences;
create policy rim_user_topic_preferences_owner_all on public.rim_user_topic_preferences for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_user_feed_events_owner_all on public.rim_user_feed_events;
create policy rim_user_feed_events_owner_all on public.rim_user_feed_events for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_feed_impressions_owner_all on public.rim_feed_impressions;
create policy rim_feed_impressions_owner_all on public.rim_feed_impressions for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_feed_collections_owner_all on public.rim_feed_collections;
create policy rim_feed_collections_owner_all on public.rim_feed_collections for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_feed_collection_items_owner_all on public.rim_feed_collection_items;
create policy rim_feed_collection_items_owner_all on public.rim_feed_collection_items for all to authenticated using(exists(select 1 from public.rim_feed_collections c where c.id=collection_id and c.user_id=(select auth.uid()))) with check(exists(select 1 from public.rim_feed_collections c where c.id=collection_id and c.user_id=(select auth.uid())));
drop policy if exists rim_muted_topics_owner_all on public.rim_user_muted_topics;
create policy rim_muted_topics_owner_all on public.rim_user_muted_topics for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_muted_authors_owner_all on public.rim_user_muted_authors;
create policy rim_muted_authors_owner_all on public.rim_user_muted_authors for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_profile_preferences_owner_all on public.rim_user_profile_preferences;
create policy rim_profile_preferences_owner_all on public.rim_user_profile_preferences for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.rim_feed_post_saves,public.rim_feed_post_reactions,public.rim_feed_post_reposts,public.rim_feed_post_reports,public.rim_feed_post_drafts,public.rim_feed_post_schedule,public.rim_user_feed_preferences,public.rim_user_topic_preferences,public.rim_user_feed_events,public.rim_feed_impressions,public.rim_feed_collections,public.rim_feed_collection_items,public.rim_user_muted_topics,public.rim_user_muted_authors,public.rim_user_profile_preferences from anon;
grant select,insert,update,delete on public.rim_feed_post_saves,public.rim_feed_post_reactions,public.rim_feed_post_reposts,public.rim_feed_post_reports,public.rim_feed_post_drafts,public.rim_feed_post_schedule,public.rim_user_feed_preferences,public.rim_user_topic_preferences,public.rim_user_feed_events,public.rim_feed_impressions,public.rim_feed_collections,public.rim_feed_collection_items,public.rim_user_muted_topics,public.rim_user_muted_authors,public.rim_user_profile_preferences to authenticated;

-- Public topic taxonomy and post topic/media metadata are visible only when parent post is public.
alter table public.rim_feed_topics enable row level security;
alter table public.rim_feed_post_topics enable row level security;
alter table public.rim_feed_post_media enable row level security;
alter table public.rim_feed_post_views enable row level security;
alter table public.rim_feed_hashtags enable row level security;
alter table public.rim_feed_post_hashtags enable row level security;
alter table public.rim_feed_post_mentions enable row level security;
drop policy if exists rim_feed_topics_read on public.rim_feed_topics;
create policy rim_feed_topics_read on public.rim_feed_topics for select to authenticated using(is_active);
drop policy if exists rim_feed_post_topics_read on public.rim_feed_post_topics;
create policy rim_feed_post_topics_read on public.rim_feed_post_topics for select to authenticated using(exists(select 1 from public.feed_posts p where p.id=post_id and p.deleted_at is null and (p.visibility='public' or p.author_id=(select auth.uid()))));
drop policy if exists rim_feed_media_read on public.rim_feed_post_media;
create policy rim_feed_media_read on public.rim_feed_post_media for select to authenticated using(exists(select 1 from public.feed_posts p where p.id=post_id and p.deleted_at is null and (p.visibility='public' or p.author_id=(select auth.uid()))));
drop policy if exists rim_feed_media_owner_insert on public.rim_feed_post_media;
create policy rim_feed_media_owner_insert on public.rim_feed_post_media for insert to authenticated with check(owner_id=(select auth.uid()) and exists(select 1 from public.feed_posts p where p.id=post_id and p.author_id=(select auth.uid())));
drop policy if exists rim_feed_views_insert on public.rim_feed_post_views;
create policy rim_feed_views_insert on public.rim_feed_post_views for insert to authenticated with check(viewer_id=(select auth.uid()));
drop policy if exists rim_feed_views_owner_read on public.rim_feed_post_views;
create policy rim_feed_views_owner_read on public.rim_feed_post_views for select to authenticated using(viewer_id=(select auth.uid()));
drop policy if exists rim_feed_hashtags_read on public.rim_feed_hashtags;
create policy rim_feed_hashtags_read on public.rim_feed_hashtags for select to authenticated using(true);
drop policy if exists rim_feed_post_hashtags_read on public.rim_feed_post_hashtags;
create policy rim_feed_post_hashtags_read on public.rim_feed_post_hashtags for select to authenticated using(exists(select 1 from public.feed_posts p where p.id=post_id and p.deleted_at is null and p.visibility='public'));
drop policy if exists rim_feed_mentions_owner_read on public.rim_feed_post_mentions;
create policy rim_feed_mentions_owner_read on public.rim_feed_post_mentions for select to authenticated using(mentioned_user_id=(select auth.uid()) or exists(select 1 from public.feed_posts p where p.id=post_id and p.author_id=(select auth.uid())));
revoke all on public.rim_feed_topics,public.rim_feed_post_topics,public.rim_feed_post_media,public.rim_feed_post_views,public.rim_feed_hashtags,public.rim_feed_post_hashtags,public.rim_feed_post_mentions from anon;
grant select on public.rim_feed_topics,public.rim_feed_post_topics,public.rim_feed_post_media,public.rim_feed_hashtags,public.rim_feed_post_hashtags,public.rim_feed_post_mentions to authenticated;
grant insert,select on public.rim_feed_post_media,public.rim_feed_post_views to authenticated;

-- Service-role-only writes for server-maintained taxonomy, hashtag index, and runtime state.
revoke insert,update,delete on public.rim_feed_topics,public.rim_feed_post_topics,public.rim_feed_hashtags,public.rim_feed_post_hashtags,public.rim_feed_post_mentions from anon,authenticated;
revoke insert,update,delete on public.rim_bot_runtime_state,public.rim_bot_runtime_logs,public.rim_bot_project_versions from anon,authenticated;
