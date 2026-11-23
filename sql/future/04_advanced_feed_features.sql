-- Advanced feed/social features. Apply after 01 and 03.
alter table public.feed_post_comments add column if not exists parent_comment_id uuid references public.feed_post_comments(id) on delete cascade;
alter table public.feed_post_comments add column if not exists edited_version integer not null default 1;
alter table public.feed_post_comments add column if not exists deleted_at timestamptz;
create index if not exists feed_post_comments_parent_idx on public.feed_post_comments(post_id,parent_comment_id,created_at);

create table if not exists public.rim_feed_comment_reactions(comment_id uuid not null references public.feed_post_comments(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,reaction text not null,created_at timestamptz not null default now(),primary key(comment_id,user_id));
create table if not exists public.rim_feed_post_polls(post_id uuid primary key references public.feed_posts(id) on delete cascade,question text not null,multiple_choice boolean not null default false,anonymous boolean not null default true,closes_at timestamptz,created_by uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now());
create table if not exists public.rim_feed_poll_options(id uuid primary key default gen_random_uuid(),poll_id uuid not null references public.rim_feed_post_polls(post_id) on delete cascade,label text not null,position integer not null default 0,unique(id,poll_id),unique(poll_id,position));
create table if not exists public.rim_feed_poll_votes(id bigint generated always as identity primary key,poll_id uuid not null references public.rim_feed_post_polls(post_id) on delete cascade,option_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now(),foreign key(option_id,poll_id) references public.rim_feed_poll_options(id,poll_id) on delete cascade,unique(option_id,user_id));
create table if not exists public.rim_feed_post_revisions(id bigint generated always as identity primary key,post_id uuid not null references public.feed_posts(id) on delete cascade,editor_id uuid not null references auth.users(id) on delete cascade,version integer not null,snapshot jsonb not null,created_at timestamptz not null default now(),unique(post_id,version));
create table if not exists public.rim_feed_post_collaborators(post_id uuid not null references public.feed_posts(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,role text not null default 'editor' check(role in ('editor','moderator')),invited_by uuid not null references auth.users(id) on delete cascade,status text not null default 'pending' check(status in ('pending','accepted','revoked')),created_at timestamptz not null default now(),primary key(post_id,user_id));
create table if not exists public.rim_feed_moderation_queue(id bigint generated always as identity primary key,post_id uuid references public.feed_posts(id) on delete cascade,report_id uuid references public.rim_feed_post_reports(id) on delete cascade,status text not null default 'queued' check(status in ('queued','reviewing','actioned','dismissed')),assigned_to uuid references auth.users(id) on delete set null,decision text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.rim_feed_ranking_config(id uuid primary key default gen_random_uuid(),version text not null unique,config jsonb not null,is_active boolean not null default false,created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now());
create table if not exists public.rim_feed_recommendation_cache(user_id uuid not null references auth.users(id) on delete cascade,generated_at timestamptz not null default now(),expires_at timestamptz not null,ranking_version text not null,post_ids uuid[] not null default '{}',primary key(user_id,ranking_version));
create table if not exists public.rim_feed_topic_follows(user_id uuid not null references auth.users(id) on delete cascade,topic_id uuid not null references public.rim_feed_topics(id) on delete cascade,created_at timestamptz not null default now(),primary key(user_id,topic_id));
create table if not exists public.rim_feed_post_suppressions(user_id uuid not null references auth.users(id) on delete cascade,post_id uuid not null references public.feed_posts(id) on delete cascade,reason text not null default 'not_interested',created_at timestamptz not null default now(),primary key(user_id,post_id));
create table if not exists public.rim_feed_author_stats(author_id uuid primary key references auth.users(id) on delete cascade,post_count bigint not null default 0,follower_count bigint not null default 0,views_30d bigint not null default 0,engagement_30d numeric(8,4) not null default 0,updated_at timestamptz not null default now());

create index if not exists rim_feed_poll_votes_poll_idx on public.rim_feed_poll_votes(poll_id,option_id);
create index if not exists rim_feed_revisions_post_idx on public.rim_feed_post_revisions(post_id,version desc);
create index if not exists rim_feed_moderation_queue_idx on public.rim_feed_moderation_queue(status,created_at);
create index if not exists rim_feed_recommendation_expiry_idx on public.rim_feed_recommendation_cache(expires_at);
create index if not exists rim_feed_author_stats_engagement_idx on public.rim_feed_author_stats(engagement_30d desc);

do $$ declare t text; begin foreach t in array array['rim_feed_comment_reactions','rim_feed_post_polls','rim_feed_poll_options','rim_feed_poll_votes','rim_feed_post_revisions','rim_feed_post_collaborators','rim_feed_moderation_queue','rim_feed_ranking_config','rim_feed_recommendation_cache','rim_feed_topic_follows','rim_feed_post_suppressions','rim_feed_author_stats'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;

drop policy if exists rim_feed_comment_reactions_owner_all on public.rim_feed_comment_reactions;
create policy rim_feed_comment_reactions_owner_all on public.rim_feed_comment_reactions for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_feed_polls_read_visible on public.rim_feed_post_polls;
create policy rim_feed_polls_read_visible on public.rim_feed_post_polls for select to authenticated using(exists(select 1 from public.feed_posts p where p.id=post_id and p.deleted_at is null and (p.visibility='public' or p.author_id=(select auth.uid()))));
drop policy if exists rim_feed_poll_options_read_visible on public.rim_feed_poll_options;
create policy rim_feed_poll_options_read_visible on public.rim_feed_poll_options for select to authenticated using(exists(select 1 from public.rim_feed_post_polls q join public.feed_posts p on p.id=q.post_id where q.post_id=poll_id and p.deleted_at is null and (p.visibility='public' or p.author_id=(select auth.uid()))));
drop policy if exists rim_feed_poll_votes_owner_all on public.rim_feed_poll_votes;
create policy rim_feed_poll_votes_owner_all on public.rim_feed_poll_votes for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.rim_feed_post_polls q join public.feed_posts p on p.id=q.post_id where q.post_id=poll_id and p.deleted_at is null and (p.visibility='public' or p.author_id=(select auth.uid()))));
drop policy if exists rim_feed_revisions_owner_read on public.rim_feed_post_revisions;
create policy rim_feed_revisions_owner_read on public.rim_feed_post_revisions for select to authenticated using(exists(select 1 from public.feed_posts p where p.id=post_id and p.author_id=(select auth.uid())));
drop policy if exists rim_feed_collaborators_participant_read on public.rim_feed_post_collaborators;
create policy rim_feed_collaborators_participant_read on public.rim_feed_post_collaborators for select to authenticated using(user_id=(select auth.uid()) or invited_by=(select auth.uid()) or exists(select 1 from public.feed_posts p where p.id=post_id and p.author_id=(select auth.uid())));
drop policy if exists rim_feed_recommendation_owner_read on public.rim_feed_recommendation_cache;
create policy rim_feed_recommendation_owner_read on public.rim_feed_recommendation_cache for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists rim_feed_topic_follows_owner_all on public.rim_feed_topic_follows;
create policy rim_feed_topic_follows_owner_all on public.rim_feed_topic_follows for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_feed_suppressions_owner_all on public.rim_feed_post_suppressions;
create policy rim_feed_suppressions_owner_all on public.rim_feed_post_suppressions for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists rim_feed_author_stats_read on public.rim_feed_author_stats;
create policy rim_feed_author_stats_read on public.rim_feed_author_stats for select to authenticated using(true);

revoke all on public.rim_feed_comment_reactions,public.rim_feed_post_polls,public.rim_feed_poll_options,public.rim_feed_poll_votes,public.rim_feed_post_revisions,public.rim_feed_post_collaborators,public.rim_feed_moderation_queue,public.rim_feed_ranking_config,public.rim_feed_recommendation_cache,public.rim_feed_topic_follows,public.rim_feed_post_suppressions,public.rim_feed_author_stats from anon;
grant select,insert,update,delete on public.rim_feed_comment_reactions,public.rim_feed_poll_votes,public.rim_feed_topic_follows,public.rim_feed_post_suppressions to authenticated;
grant select on public.rim_feed_post_polls,public.rim_feed_poll_options,public.rim_feed_post_revisions,public.rim_feed_post_collaborators,public.rim_feed_recommendation_cache,public.rim_feed_author_stats to authenticated;
revoke insert,update,delete on public.rim_feed_post_polls,public.rim_feed_poll_options,public.rim_feed_post_revisions,public.rim_feed_post_collaborators,public.rim_feed_moderation_queue,public.rim_feed_ranking_config,public.rim_feed_recommendation_cache,public.rim_feed_author_stats from anon,authenticated;

create or replace function private.rim_feed_validate_poll_vote()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_multiple boolean; v_closes timestamptz;
begin
 select multiple_choice,closes_at into v_multiple,v_closes from public.rim_feed_post_polls where post_id=new.poll_id;
 if not found then raise exception 'poll_not_found' using errcode='P0002'; end if;
 if v_closes is not null and v_closes<=now() then raise exception 'poll_closed' using errcode='22023'; end if;
 if not v_multiple and exists(select 1 from public.rim_feed_poll_votes v where v.poll_id=new.poll_id and v.user_id=new.user_id and v.id is distinct from new.id) then raise exception 'single_choice_poll_already_voted' using errcode='23505'; end if;
 return new;
end $$;
revoke all on function private.rim_feed_validate_poll_vote() from public,anon,authenticated;
drop trigger if exists rim_feed_poll_vote_validate on public.rim_feed_poll_votes;
create trigger rim_feed_poll_vote_validate before insert or update on public.rim_feed_poll_votes for each row execute function private.rim_feed_validate_poll_vote();
