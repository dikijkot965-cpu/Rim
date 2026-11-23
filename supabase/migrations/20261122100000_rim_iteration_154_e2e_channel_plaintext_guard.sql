-- Iteration 154: server-side guard for legacy channel content paths.
-- Channel polls/comments/posts are currently plaintext features. They remain
-- available in public and non-E2E private channels, but must not write into an
-- E2E-required private channel. The activation guard also refuses to mark a
-- channel E2E-required while legacy plaintext content is still present.

create or replace function private.rim_guard_e2e_channel_plaintext_write()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_channel_id uuid;
  v_is_public boolean;
  v_e2e_mode text;
begin
  if tg_table_name='channel_poll_votes' then
    select p.channel_id into v_channel_id
      from public.channel_polls p where p.id=new.poll_id;
  elsif tg_table_name='channel_reactions' then
    select p.channel_id into v_channel_id
      from public.channel_posts p where p.id=new.post_id;
  else
    v_channel_id := new.channel_id;
  end if;

  if v_channel_id is null then
    raise exception 'e2e_channel_plaintext_parent_not_found'
      using errcode='23503';
  end if;

  -- Serialize all legacy content writes against E2E activation for this
  -- channel. Both paths take the same transaction-scoped advisory lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_channel_id::text,0));

  select c.is_public,c.e2e_mode into v_is_public,v_e2e_mode
    from public.channels c where c.id=v_channel_id;

  if v_is_public is false and v_e2e_mode='required' then
    -- channel_posts already has an encrypted envelope contract from migration
    -- 136. Preserve that future path; reject only plaintext or malformed rows.
    if tg_table_name='channel_posts' then
      if new.encryption_version is distinct from 1
         or new.encrypted_payload is null
         or coalesce(new.body,'')<>'' then
        raise exception 'e2e_required_plaintext_channel_post_rejected'
          using errcode='23514';
      end if;
    else
      raise exception 'e2e_required_plaintext_channel_write_rejected'
        using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.rim_guard_e2e_channel_plaintext_write() from public,anon,authenticated;

-- Plaintext-bearing content and metadata writes are guarded at the database
-- boundary as well as in the client. This also covers old direct-table paths.
drop trigger if exists rim_guard_e2e_channel_plaintext_posts on public.channel_posts;
create trigger rim_guard_e2e_channel_plaintext_posts
before insert or update on public.channel_posts
for each row execute function private.rim_guard_e2e_channel_plaintext_write();

drop trigger if exists rim_guard_e2e_channel_plaintext_polls on public.channel_polls;
create trigger rim_guard_e2e_channel_plaintext_polls
before insert or update on public.channel_polls
for each row execute function private.rim_guard_e2e_channel_plaintext_write();

drop trigger if exists rim_guard_e2e_channel_plaintext_comments on public.channel_post_comments;
create trigger rim_guard_e2e_channel_plaintext_comments
before insert or update on public.channel_post_comments
for each row execute function private.rim_guard_e2e_channel_plaintext_write();

drop trigger if exists rim_guard_e2e_channel_plaintext_poll_votes on public.channel_poll_votes;
create trigger rim_guard_e2e_channel_plaintext_poll_votes
before insert or update on public.channel_poll_votes
for each row execute function private.rim_guard_e2e_channel_plaintext_write();

drop trigger if exists rim_guard_e2e_channel_plaintext_reactions on public.channel_reactions;
create trigger rim_guard_e2e_channel_plaintext_reactions
before insert or update on public.channel_reactions
for each row execute function private.rim_guard_e2e_channel_plaintext_write();

drop trigger if exists rim_guard_e2e_channel_plaintext_scheduled on public.channel_scheduled_posts;
create trigger rim_guard_e2e_channel_plaintext_scheduled
before insert or update on public.channel_scheduled_posts
for each row execute function private.rim_guard_e2e_channel_plaintext_write();

create or replace function private.rim_guard_e2e_channel_plaintext_activation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  if new.is_public is false
     and new.e2e_mode='required'
     and coalesce(old.e2e_mode,'off')<>'required' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text,0));
    if exists (
         select 1 from public.channel_posts p
         where p.channel_id=new.id
           and (p.encryption_version is distinct from 1
             or p.encrypted_payload is null
             or coalesce(p.body,'')<>'')
       )
       or exists (select 1 from public.channel_polls p where p.channel_id=new.id)
       or exists (select 1 from public.channel_post_comments c where c.channel_id=new.id)
       or exists (select 1 from public.channel_scheduled_posts s where s.channel_id=new.id and s.status='scheduled') then
      raise exception 'e2e_channel_has_legacy_plaintext_content'
        using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.rim_guard_e2e_channel_plaintext_activation() from public,anon,authenticated;
drop trigger if exists rim_guard_e2e_channel_plaintext_activation on public.channels;
create trigger rim_guard_e2e_channel_plaintext_activation
before update of e2e_mode on public.channels
for each row execute function private.rim_guard_e2e_channel_plaintext_activation();
