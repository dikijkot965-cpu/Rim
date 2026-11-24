-- Iteration 177: server-enforced media controls and configurable welcome notices.
-- Additive only. No E2E protocol, ciphertext, or key tables are changed.
create table if not exists public.rim_imperial_channel_controls (
  channel_id uuid primary key references public.channels(id) on delete cascade,
  images_enabled boolean not null default true, videos_enabled boolean not null default true,
  welcome_enabled boolean not null default false, welcome_title text not null default 'Добро пожаловать',
  welcome_body text not null default '', updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.rim_imperial_conversation_controls (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  images_enabled boolean not null default true, videos_enabled boolean not null default true,
  welcome_enabled boolean not null default false, welcome_title text not null default 'Добро пожаловать',
  welcome_body text not null default '', updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.rim_imperial_welcome_settings (
  scope_key text primary key, enabled boolean not null default false,
  title text not null default 'Добро пожаловать в Римъ', body text not null default '',
  updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now(),
  constraint rim_imperial_welcome_scope_key_check check (scope_key = 'global' or scope_key ~ '^(group|channel):[0-9a-f-]{36}$'),
  constraint rim_imperial_welcome_body_size_check check (length(body) <= 2000)
);
alter table public.rim_imperial_channel_controls enable row level security;
alter table public.rim_imperial_conversation_controls enable row level security;
alter table public.rim_imperial_welcome_settings enable row level security;
revoke all on public.rim_imperial_channel_controls, public.rim_imperial_conversation_controls, public.rim_imperial_welcome_settings from public,anon,authenticated;
grant select,insert,update,delete on public.rim_imperial_channel_controls,public.rim_imperial_conversation_controls,public.rim_imperial_welcome_settings to service_role;

create or replace function public.rim_admin_list_channels(p_query text default '',p_limit integer default 500,p_offset integer default 0)
returns table(channel_id uuid,title text,username text,is_public boolean,member_count bigint,images_enabled boolean,videos_enabled boolean,welcome_enabled boolean,welcome_title text,welcome_body text)
language plpgsql stable security definer set search_path='' as $$
declare q text:=lower(trim(coalesce(p_query,'')));
begin
 if auth.uid() is null or not exists(select 1 from public.app_user_roles r where r.user_id=auth.uid() and r.role='superadmin') then raise exception 'Доступ только для суперадминистратора'; end if;
 return query select c.id,c.title,c.username,c.is_public,(select count(*) from public.channel_members m where m.channel_id=c.id),
 coalesce(x.images_enabled,true),coalesce(x.videos_enabled,true),coalesce(x.welcome_enabled,false),coalesce(x.welcome_title,'Добро пожаловать'),coalesce(x.welcome_body,'')
 from public.channels c left join public.rim_imperial_channel_controls x on x.channel_id=c.id
 where q='' or c.title ilike '%'||q||'%' or coalesce(c.username,'') ilike '%'||q||'%' or c.id::text ilike '%'||q||'%'
 order by c.created_at desc limit greatest(1,least(coalesce(p_limit,500),1000)) offset greatest(coalesce(p_offset,0),0);
end $$;
revoke all on function public.rim_admin_list_channels(text,integer,integer) from public,anon;
grant execute on function public.rim_admin_list_channels(text,integer,integer) to authenticated;

create or replace function public.rim_admin_set_channel_controls(p_channel_id uuid,p_images_enabled boolean,p_videos_enabled boolean,p_welcome_enabled boolean default false,p_welcome_title text default 'Добро пожаловать',p_welcome_body text default '')
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.app_user_roles r where r.user_id=auth.uid() and r.role='superadmin') then raise exception 'Доступ только для суперадминистратора'; end if;
 if not exists(select 1 from public.channels c where c.id=p_channel_id) then raise exception 'Канал не найден'; end if;
 if length(coalesce(p_welcome_body,''))>2000 then raise exception 'Текст приветствия слишком длинный'; end if;
 insert into public.rim_imperial_channel_controls(channel_id,images_enabled,videos_enabled,welcome_enabled,welcome_title,welcome_body,updated_by,updated_at)
 values(p_channel_id,coalesce(p_images_enabled,true),coalesce(p_videos_enabled,true),coalesce(p_welcome_enabled,false),left(coalesce(p_welcome_title,'Добро пожаловать'),120),coalesce(p_welcome_body,''),auth.uid(),now())
 on conflict(channel_id) do update set images_enabled=excluded.images_enabled,videos_enabled=excluded.videos_enabled,welcome_enabled=excluded.welcome_enabled,welcome_title=excluded.welcome_title,welcome_body=excluded.welcome_body,updated_by=auth.uid(),updated_at=now();
end $$;
revoke all on function public.rim_admin_set_channel_controls(uuid,boolean,boolean,boolean,text,text) from public,anon;
grant execute on function public.rim_admin_set_channel_controls(uuid,boolean,boolean,boolean,text,text) to authenticated;

create or replace function public.rim_admin_set_conversation_controls(p_conversation_id uuid,p_images_enabled boolean,p_videos_enabled boolean,p_welcome_enabled boolean default false,p_welcome_title text default 'Добро пожаловать',p_welcome_body text default '')
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.app_user_roles r where r.user_id=auth.uid() and r.role='superadmin') then raise exception 'Доступ только для суперадминистратора'; end if;
 if not exists(select 1 from public.conversations c where c.id=p_conversation_id and c.type='group') then raise exception 'Группа не найдена'; end if;
 if length(coalesce(p_welcome_body,''))>2000 then raise exception 'Текст приветствия слишком длинный'; end if;
 insert into public.rim_imperial_conversation_controls(conversation_id,images_enabled,videos_enabled,welcome_enabled,welcome_title,welcome_body,updated_by,updated_at)
 values(p_conversation_id,coalesce(p_images_enabled,true),coalesce(p_videos_enabled,true),coalesce(p_welcome_enabled,false),left(coalesce(p_welcome_title,'Добро пожаловать'),120),coalesce(p_welcome_body,''),auth.uid(),now())
 on conflict(conversation_id) do update set images_enabled=excluded.images_enabled,videos_enabled=excluded.videos_enabled,welcome_enabled=excluded.welcome_enabled,welcome_title=excluded.welcome_title,welcome_body=excluded.welcome_body,updated_by=auth.uid(),updated_at=now();
end $$;
revoke all on function public.rim_admin_set_conversation_controls(uuid,boolean,boolean,boolean,text,text) from public,anon;
grant execute on function public.rim_admin_set_conversation_controls(uuid,boolean,boolean,boolean,text,text) to authenticated;

create or replace function public.rim_admin_save_global_welcome(p_enabled boolean,p_title text,p_body text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.app_user_roles r where r.user_id=auth.uid() and r.role='superadmin') then raise exception 'Доступ только для суперадминистратора'; end if;
 if length(coalesce(p_body,''))>2000 then raise exception 'Текст приветствия слишком длинный'; end if;
 insert into public.rim_imperial_welcome_settings(scope_key,enabled,title,body,updated_by,updated_at)
 values('global',coalesce(p_enabled,false),left(coalesce(p_title,'Добро пожаловать в Римъ'),120),coalesce(p_body,''),auth.uid(),now())
 on conflict(scope_key) do update set enabled=excluded.enabled,title=excluded.title,body=excluded.body,updated_by=auth.uid(),updated_at=now();
end $$;
revoke all on function public.rim_admin_save_global_welcome(boolean,text,text) from public,anon;
grant execute on function public.rim_admin_save_global_welcome(boolean,text,text) to authenticated;

create or replace function public.rim_admin_list_groups(p_query text default '',p_limit integer default 500,p_offset integer default 0)
returns table(conversation_id uuid,title text,member_count bigint,images_enabled boolean,videos_enabled boolean,welcome_enabled boolean,welcome_title text,welcome_body text)
language plpgsql stable security definer set search_path='' as $$
declare q text:=lower(trim(coalesce(p_query,'')));
begin
 if auth.uid() is null or not exists(select 1 from public.app_user_roles r where r.user_id=auth.uid() and r.role='superadmin') then raise exception 'Доступ только для суперадминистратора'; end if;
 return query select c.id,coalesce(c.title,'Группа'),(select count(*) from public.conversation_members m where m.conversation_id=c.id),
 coalesce(x.images_enabled,true),coalesce(x.videos_enabled,true),coalesce(x.welcome_enabled,false),coalesce(x.welcome_title,'Добро пожаловать'),coalesce(x.welcome_body,'')
 from public.conversations c left join public.rim_imperial_conversation_controls x on x.conversation_id=c.id
 where c.type='group' and (q='' or coalesce(c.title,'') ilike '%'||q||'%' or c.id::text ilike '%'||q||'%')
 order by c.created_at desc limit greatest(1,least(coalesce(p_limit,500),1000)) offset greatest(coalesce(p_offset,0),0);
end $$;
revoke all on function public.rim_admin_list_groups(text,integer,integer) from public,anon;
grant execute on function public.rim_admin_list_groups(text,integer,integer) to authenticated;

create or replace function public.rim_admin_get_global_welcome()
returns table(enabled boolean,title text,body text) language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.app_user_roles r where r.user_id=auth.uid() and r.role='superadmin') then raise exception 'Доступ только для суперадминистратора'; end if;
 return query select coalesce(w.enabled,false),coalesce(w.title,'Добро пожаловать в Римъ'),coalesce(w.body,'') from (select 1) seed left join public.rim_imperial_welcome_settings w on w.scope_key='global';
end $$;
revoke all on function public.rim_admin_get_global_welcome() from public,anon;
grant execute on function public.rim_admin_get_global_welcome() to authenticated;

create or replace function private.rim_chat_media_upload_allowed(p_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare parts text[]; ext text; allow_images boolean:=true; allow_videos boolean:=true; v_channel_id uuid; v_conversation_id uuid;
begin
 parts:=string_to_array(coalesce(p_name,''),'/'); ext:=lower(reverse(split_part(reverse(coalesce(parts[array_length(parts,1)],'')),'.',1)));
 if ext in ('jpg','jpeg','png','webp','gif','avif','heic') then
  if coalesce(parts[1],'')='channels' and array_length(parts,1)>=3 then
   begin v_channel_id:=parts[2]::uuid; exception when others then return false; end;
   select coalesce(c.images_enabled,true) into allow_images from public.rim_imperial_channel_controls c where c.channel_id=v_channel_id;
   return coalesce(allow_images,true);
  elsif array_length(parts,1)>=3 then
   begin v_conversation_id:=parts[2]::uuid; exception when others then return true; end;
   select coalesce(c.images_enabled,true) into allow_images from public.rim_imperial_conversation_controls c where c.conversation_id=v_conversation_id;
   return coalesce(allow_images,true);
  end if;
 elsif ext in ('mp4','webm','mov','m4v','3gp','ogv') then
  if coalesce(parts[1],'')='channels' and array_length(parts,1)>=3 then
   begin v_channel_id:=parts[2]::uuid; exception when others then return false; end;
   select coalesce(c.videos_enabled,true) into allow_videos from public.rim_imperial_channel_controls c where c.channel_id=v_channel_id;
   return coalesce(allow_videos,true);
  elsif array_length(parts,1)>=3 then
   begin v_conversation_id:=parts[2]::uuid; exception when others then return true; end;
   select coalesce(c.videos_enabled,true) into allow_videos from public.rim_imperial_conversation_controls c where c.conversation_id=v_conversation_id;
   return coalesce(allow_videos,true);
  end if;
 end if;
 return true;
end $$;
revoke all on function private.rim_chat_media_upload_allowed(text) from public,anon,authenticated;
grant execute on function private.rim_chat_media_upload_allowed(text) to authenticated;

create or replace function private.rim_storage_path_member_or_personal(p_folder text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(p_folder,'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return public.is_conversation_member(p_folder::uuid); end if;
 return true;
exception when others then return false;
end $$;
revoke all on function private.rim_storage_path_member_or_personal(text) from public,anon,authenticated;
grant execute on function private.rim_storage_path_member_or_personal(text) to authenticated;

drop policy if exists "Users can upload chat images" on storage.objects;
create policy "Users can upload chat images" on storage.objects for insert to authenticated
with check(bucket_id='chat-files' and (storage.foldername(name))[1]=(select auth.uid())::text and private.rim_storage_path_member_or_personal((storage.foldername(name))[2]) and private.rim_chat_media_upload_allowed(name));
drop policy if exists chat_files_insert_own_folder on storage.objects;
create policy chat_files_insert_own_folder on storage.objects for insert to authenticated with check(bucket_id='chat-files' and (
 ((storage.foldername(name))[1]=(select auth.uid())::text and private.rim_storage_path_member_or_personal((storage.foldername(name))[2]) and private.rim_chat_media_upload_allowed(name))
 or ((storage.foldername(name))[1]='channels' and exists(select 1 from public.channels c left join public.channel_members m on m.channel_id=c.id where c.id=((storage.foldername(name))[2])::uuid and (c.owner_id=auth.uid() or (m.user_id=auth.uid() and m.role in ('admin','moderator')))) and private.rim_chat_media_upload_allowed(name))
));

create or replace function private.rim_dispatch_imperial_welcome()
returns trigger language plpgsql security definer set search_path='' as $$
declare cfg record; target uuid;
begin
 if tg_table_name='conversation_members' then target:=new.conversation_id; select welcome_enabled as enabled,welcome_title as title,welcome_body as body into cfg from public.rim_imperial_conversation_controls where conversation_id=new.conversation_id;
 elsif tg_table_name='channel_members' then target:=new.channel_id; select welcome_enabled as enabled,welcome_title as title,welcome_body as body into cfg from public.rim_imperial_channel_controls where channel_id=new.channel_id;
 else return new; end if;
 if coalesce(cfg.enabled,false) and length(trim(coalesce(cfg.body,'')))>0 then
  insert into public.app_notifications(user_id,notification_type,title,body,target_id) values(new.user_id,'imperial_welcome',coalesce(cfg.title,'Добро пожаловать'),cfg.body,target);
 else
  select enabled,title,body into cfg from public.rim_imperial_welcome_settings where scope_key='global';
  if coalesce(cfg.enabled,false) and length(trim(coalesce(cfg.body,'')))>0 then insert into public.app_notifications(user_id,notification_type,title,body,target_id) values(new.user_id,'imperial_welcome',coalesce(cfg.title,'Добро пожаловать'),cfg.body,target); end if;
 end if;
 return new;
end $$;
revoke all on function private.rim_dispatch_imperial_welcome() from public,anon,authenticated;
drop trigger if exists rim_imperial_welcome_conversation_member on public.conversation_members;
create trigger rim_imperial_welcome_conversation_member after insert on public.conversation_members for each row execute function private.rim_dispatch_imperial_welcome();
drop trigger if exists rim_imperial_welcome_channel_member on public.channel_members;
create trigger rim_imperial_welcome_channel_member after insert on public.channel_members for each row execute function private.rim_dispatch_imperial_welcome();

create or replace function private.rim_dispatch_new_user_welcome()
returns trigger language plpgsql security definer set search_path='' as $$
declare cfg record;
begin
 select enabled,title,body into cfg from public.rim_imperial_welcome_settings where scope_key='global';
 if coalesce(cfg.enabled,false) and length(trim(coalesce(cfg.body,'')))>0 then insert into public.app_notifications(user_id,notification_type,title,body) values(new.id,'imperial_welcome',coalesce(cfg.title,'Добро пожаловать в Римъ'),cfg.body); end if;
 return new;
end $$;
revoke all on function private.rim_dispatch_new_user_welcome() from public,anon,authenticated;
drop trigger if exists rim_imperial_welcome_new_user on auth.users;
create trigger rim_imperial_welcome_new_user after insert on auth.users for each row execute function private.rim_dispatch_new_user_welcome();
