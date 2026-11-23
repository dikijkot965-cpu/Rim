-- Iteration 133: atomic join-request review and safe scheduled-post operations.
create or replace function public.rim_channel_review_join_request(p_request_id uuid, p_decision text)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare v_request public.channel_join_requests%rowtype;
begin
  if auth.uid() is null or p_decision not in ('approved','rejected') then
    raise exception 'invalid_request';
  end if;
  select * into v_request from public.channel_join_requests
    where id=p_request_id and status='pending' for update;
  if not found then return false; end if;
  if not public.app_can_manage_channel(v_request.channel_id) then
    raise exception 'not_channel_manager';
  end if;
  update public.channel_join_requests set status=p_decision,
    reviewed_by=auth.uid(), reviewed_at=now()
    where id=p_request_id and status='pending';
  if p_decision='approved' then
    insert into public.channel_members(channel_id,user_id,role)
      values(v_request.channel_id,v_request.user_id,'subscriber')
      on conflict(channel_id,user_id) do nothing;
  end if;
  return true;
end;
$$;
revoke all on function public.rim_channel_review_join_request(uuid,text) from public, anon;
grant execute on function public.rim_channel_review_join_request(uuid,text) to authenticated;

create or replace function public.rim_channel_publish_scheduled(p_scheduled_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare v_item public.channel_scheduled_posts%rowtype; v_post_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_item from public.channel_scheduled_posts
    where id=p_scheduled_id and status='scheduled' for update;
  if not found then return null; end if;
  if not public.app_can_manage_channel(v_item.channel_id) then raise exception 'not_channel_manager'; end if;
  insert into public.channel_posts(channel_id,author_id,body)
    values(v_item.channel_id,v_item.author_id,v_item.body) returning id into v_post_id;
  update public.channel_scheduled_posts set status='published',published_post_id=v_post_id
    where id=v_item.id;
  return v_post_id;
end;
$$;
revoke all on function public.rim_channel_publish_scheduled(uuid) from public, anon;
grant execute on function public.rim_channel_publish_scheduled(uuid) to authenticated;

create index if not exists idx_channel_join_requests_pending_created
  on public.channel_join_requests(channel_id,created_at) where status='pending';
create index if not exists idx_channel_scheduled_posts_queue
  on public.channel_scheduled_posts(channel_id,scheduled_at) where status='scheduled';
