alter table public.channel_posts
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references auth.users(id) on delete set null;
create index if not exists channel_posts_pinned_idx
  on public.channel_posts(channel_id,pinned_at desc,id desc) where is_pinned=true;

create or replace function public.rim_channel_pin_post(p_post_id uuid,p_pinned boolean)
returns boolean language plpgsql security definer set search_path=''
as $$ declare v_channel_id uuid; v_owner_id uuid; v_user_id uuid; begin
  v_user_id:=auth.uid();
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select cp.channel_id into v_channel_id from public.channel_posts cp where cp.id=p_post_id;
  if v_channel_id is null then raise exception 'channel_post_not_found'; end if;
  select c.owner_id into v_owner_id from public.channels c where c.id=v_channel_id;
  if v_owner_id is distinct from v_user_id
    and not exists(select 1 from public.channel_members cm where cm.channel_id=v_channel_id and cm.user_id=v_user_id and cm.role in ('admin','moderator'))
    and not public.app_is_imperator() then raise exception 'channel_management_permission_required'; end if;
  update public.channel_posts set is_pinned=coalesce(p_pinned,false),
    pinned_at=case when coalesce(p_pinned,false) then now() else null end,
    pinned_by=case when coalesce(p_pinned,false) then v_user_id else null end
  where id=p_post_id;
  return true;
end $$;
revoke all on function public.rim_channel_pin_post(uuid,boolean) from public,anon;
grant execute on function public.rim_channel_pin_post(uuid,boolean) to authenticated;
