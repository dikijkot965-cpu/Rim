-- Iteration 153: scheduled channel posts remain plaintext today, so they must
-- not be created or retained when a private channel requires E2E.
-- Encrypted scheduling is intentionally unsupported until a dedicated payload
-- and scheduler transport are implemented.

create or replace function private.rim_guard_e2e_channel_schedule_write()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_mode text;
  v_public boolean;
begin
  select c.e2e_mode,c.is_public into v_mode,v_public
    from public.channels c where c.id=new.channel_id;

  if v_mode='required' and v_public is false then
    raise exception 'e2e_required_plaintext_channel_schedule_rejected'
      using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function private.rim_guard_e2e_channel_schedule_write() from public,anon,authenticated;
drop trigger if exists rim_guard_e2e_channel_schedule_write on public.channel_scheduled_posts;
create trigger rim_guard_e2e_channel_schedule_write
before insert or update of channel_id,body,media_paths on public.channel_scheduled_posts
for each row execute function private.rim_guard_e2e_channel_schedule_write();

create or replace function private.rim_guard_e2e_channel_schedule_activation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  if new.e2e_mode='required'
     and coalesce(old.e2e_mode,'off')<>'required'
     and exists (
       select 1 from public.channel_scheduled_posts sp
       where sp.channel_id=new.id and sp.status='scheduled'
     ) then
    raise exception 'e2e_channel_has_plaintext_scheduled_posts'
      using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function private.rim_guard_e2e_channel_schedule_activation() from public,anon,authenticated;
drop trigger if exists rim_guard_e2e_channel_schedule_activation on public.channels;
create trigger rim_guard_e2e_channel_schedule_activation
before update of e2e_mode on public.channels
for each row execute function private.rim_guard_e2e_channel_schedule_activation();
