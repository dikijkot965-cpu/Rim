alter table public.channel_member_moderation enable row level security;

drop policy if exists channel_moderation_manager_read on public.channel_member_moderation;
create policy channel_moderation_manager_read
on public.channel_member_moderation
for select
to authenticated
using (public.app_can_manage_channel(channel_id));

revoke select on table public.channel_member_moderation from public, anon;
grant select on table public.channel_member_moderation to authenticated;

comment on policy channel_moderation_manager_read on public.channel_member_moderation is
  'Allows channel owners and the imperial administrator to read moderation metadata only for channels they manage; the restrictive seed-session gate remains in force.';
