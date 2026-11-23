create or replace function private.rim_user_owns_bot(p_bot_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
 select exists(select 1 from public.rim_bots b where b.id=p_bot_id and b.owner_id=auth.uid() and b.is_active=true)
$$;
revoke all on function private.rim_user_owns_bot(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.rim_user_owns_bot(uuid) to authenticated;
drop policy if exists rim_bot_projects_owner_all on public.rim_bot_projects;
create policy rim_bot_projects_owner_all on public.rim_bot_projects for all to authenticated
using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and private.rim_user_owns_bot(bot_id));

create or replace function public.rim_bot_request_runtime(p_bot_id uuid,p_desired_state text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_owner uuid;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='28000'; end if;
 if p_desired_state not in ('running','stopped') then raise exception 'invalid_state' using errcode='22023'; end if;
 select owner_id into v_owner from public.rim_bots where id=p_bot_id and owner_id=auth.uid() and is_active=true;
 if v_owner is null then raise exception 'bot_not_found' using errcode='P0002'; end if;
 insert into public.rim_bot_runtime_state(bot_id,owner_id,desired_state,actual_state,updated_at)
 values(p_bot_id,v_owner,p_desired_state,case when p_desired_state='running' then 'queued' else 'stopped' end,now())
 on conflict(bot_id) do update set desired_state=excluded.desired_state,actual_state=case when excluded.desired_state='running' then 'queued' else 'stopped' end,updated_at=now();
 return jsonb_build_object('bot_id',p_bot_id,'desired_state',p_desired_state,'accepted',true);
end $$;
revoke all on function public.rim_bot_request_runtime(uuid,text) from public,anon;
grant execute on function public.rim_bot_request_runtime(uuid,text) to authenticated;
