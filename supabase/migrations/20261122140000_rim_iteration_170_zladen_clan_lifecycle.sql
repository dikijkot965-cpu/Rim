-- Iteration 170: complete the clan tables with a server-owned command lifecycle.
-- The bot command pipeline remains disabled in E2E-required conversations.

create table if not exists public.rim_zladen_clan_invites (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.rim_zladen_clans(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  uses integer not null default 0 check (uses >= 0),
  max_uses integer not null default 20 check (max_uses between 1 and 1000),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create index if not exists rim_zladen_clan_invites_clan_idx
  on public.rim_zladen_clan_invites(clan_id, expires_at desc);

alter table public.rim_zladen_clan_invites enable row level security;
revoke all on public.rim_zladen_clan_invites from public, anon, authenticated;

create or replace function private.rim_zladen_handle_clan_commands()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_conversation public.conversations%rowtype;
  v_token text;
  v_rest text;
  v_action text;
  v_args text[];
  v_reply text;
  v_slug text;
  v_name text;
  v_description text;
  v_code text;
  v_hash text;
  v_target uuid;
  v_clan public.rim_zladen_clans%rowtype;
  v_invite public.rim_zladen_clan_invites%rowtype;
  v_role text;
  v_members integer;
  v_lines text;
  v_id uuid;
begin
  if new.sender_id is null or coalesce(new.body, '') = '' then return new; end if;

  select * into v_bot
  from public.rim_system_bot_registry
  where bot_key = 'zladen' and is_active is true;
  if not found or v_bot.bot_user_id is null or new.sender_id = v_bot.bot_user_id then return new; end if;

  select * into v_conversation from public.conversations where id = new.conversation_id;
  if not found or coalesce(v_conversation.e2e_mode, 'off') = 'required' then return new; end if;
  if not exists (
    select 1 from public.conversation_members
    where conversation_id = new.conversation_id and user_id = v_bot.bot_user_id
  ) then return new; end if;
  if exists (
    select 1 from public.rim_system_bot_installs
    where user_id = new.sender_id and bot_key = 'zladen' and state in ('blocked', 'unsubscribed')
  ) then return new; end if;

  v_token := lower(split_part(btrim(new.body), ' ', 1));
  if v_token !~ '^[/!.]' then return new; end if;
  v_token := regexp_replace(v_token, '^[/!.]', '');
  v_token := regexp_replace(v_token, '@' || coalesce(v_bot.username, 'zladen_bot') || '$', '');
  if v_token <> 'clan' then return new; end if;

  v_rest := btrim(substr(btrim(new.body), length(split_part(btrim(new.body), ' ', 1)) + 1));
  v_action := lower(split_part(v_rest, ' ', 1));

  if v_action in ('', 'help', 'menu') then
    v_reply := 'Кланы Злыди:' || E'\n' ||
      '/clan create slug | название | описание — создать клан' || E'\n' ||
      '/clan join slug — вступить в публичный клан' || E'\n' ||
      '/clan invite — создать одноразово используемый код-приглашение (до 20 вступлений)' || E'\n' ||
      '/clan join CODE — вступить по приглашению' || E'\n' ||
      '/clan leave — покинуть клан' || E'\n' ||
      '/clan info [slug] — информация о клане' || E'\n' ||
      '/clan top — рейтинг публичных кланов' || E'\n' ||
      '/clan visibility public|private — доступ к клану' || E'\n' ||
      '/clan kick UUID — исключить участника (админ)' || E'\n' ||
      '/clan promote UUID — назначить администратора (владелец)' || E'\n' ||
      '/clan delete — удалить клан (владелец, если остался один).';

  elsif v_action = 'create' then
    v_args := string_to_array(btrim(substr(v_rest, 7)), '|');
    if coalesce(array_length(v_args, 1), 0) <> 3 then
      v_reply := 'Формат: /clan create slug | название | описание.';
    else
      v_slug := lower(btrim(v_args[1]));
      v_name := btrim(v_args[2]);
      v_description := left(btrim(v_args[3]), 300);
      if v_slug !~ '^[a-z0-9_]{3,24}$' or char_length(v_name) not between 3 and 40 then
        v_reply := 'Slug: 3–24 символа латиницей/цифрами; название: 3–40 символов.';
      else
        begin
          insert into public.rim_zladen_clans(slug, name, description, owner_id, is_public)
          values (v_slug, v_name, v_description, new.sender_id, true)
          returning * into v_clan;
          insert into public.rim_zladen_clan_members(clan_id, user_id, clan_role)
          values (v_clan.id, new.sender_id, 'leader');
          v_reply := 'Клан «' || v_clan.name || '» создан. Slug: ' || v_clan.slug || '. Используй /clan invite, чтобы пригласить участников.';
        exception when unique_violation then
          v_reply := 'Этот slug уже занят. Выбери другой.';
        end;
      end if;
    end if;

  elsif v_action = 'join' then
    v_code := btrim(split_part(v_rest, ' ', 2));
    if v_code = '' then
      v_reply := 'Формат: /clan join slug или /clan join CODE.';
    else
      select * into v_clan from public.rim_zladen_clans where slug = lower(v_code) and is_public is true;
      if found then
        insert into public.rim_zladen_clan_members(clan_id, user_id, clan_role)
        values (v_clan.id, new.sender_id, 'member') on conflict (clan_id, user_id) do nothing;
        v_reply := 'Ты участник клана «' || v_clan.name || '».';
      else
        v_hash := encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex');
        select * into v_invite from public.rim_zladen_clan_invites
        where code_hash = v_hash and expires_at > now() and uses < max_uses
        for update;
        if not found then
          v_reply := 'Публичный клан или действующее приглашение не найдены.';
        else
          select * into v_clan from public.rim_zladen_clans where id = v_invite.clan_id;
          insert into public.rim_zladen_clan_members(clan_id, user_id, clan_role)
          values (v_clan.id, new.sender_id, 'member') on conflict (clan_id, user_id) do nothing;
          if found then update public.rim_zladen_clan_invites set uses = uses + 1 where id = v_invite.id; end if;
          v_reply := 'Приглашение принято. Ты участник клана «' || v_clan.name || '».';
        end if;
      end if;
    end if;

  elsif v_action = 'invite' then
    select c.* into v_clan
    from public.rim_zladen_clans c
    join public.rim_zladen_clan_members m on m.clan_id = c.id
    where m.user_id = new.sender_id and m.clan_role in ('leader', 'deputy')
    order by m.joined_at desc limit 1;
    if not found then
      v_reply := 'Создавать приглашения может лидер или заместитель клана.';
    else
      v_code := encode(extensions.gen_random_bytes(8), 'hex');
      v_hash := encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex');
      insert into public.rim_zladen_clan_invites(clan_id, code_hash, created_by, max_uses, expires_at)
      values (v_clan.id, v_hash, new.sender_id, 20, now() + interval '7 days');
      v_reply := 'Код приглашения в «' || v_clan.name || '»: ' || v_code || E'\n' || 'Срок — 7 дней, максимум 20 вступлений. Передавай код только тем, кого хочешь видеть в клане.';
    end if;

  elsif v_action = 'leave' then
    select c.* into v_clan
    from public.rim_zladen_clans c
    join public.rim_zladen_clan_members m on m.clan_id = c.id
    where m.user_id = new.sender_id order by m.joined_at desc limit 1;
    if not found then
      v_reply := 'Ты не состоишь в клане.';
    else
      select count(*) into v_members from public.rim_zladen_clan_members where clan_id = v_clan.id;
      if v_clan.owner_id = new.sender_id and v_members > 1 then
        v_reply := 'Владелец не может покинуть клан, пока в нём есть участники. Сначала передай владение или удали участников.';
      elsif v_clan.owner_id = new.sender_id then
        delete from public.rim_zladen_clans where id = v_clan.id;
        v_reply := 'Клан удалён: владелец был последним участником.';
      else
        delete from public.rim_zladen_clan_members where clan_id = v_clan.id and user_id = new.sender_id;
        v_reply := 'Ты покинул клан «' || v_clan.name || '».';
      end if;
    end if;

  elsif v_action = 'info' then
    v_slug := lower(btrim(split_part(v_rest, ' ', 2)));
    if v_slug = '' then
      select c.* into v_clan from public.rim_zladen_clans c
      join public.rim_zladen_clan_members m on m.clan_id = c.id
      where m.user_id = new.sender_id order by m.joined_at desc limit 1;
    else
      select * into v_clan from public.rim_zladen_clans where slug = v_slug and (is_public is true or exists (
        select 1 from public.rim_zladen_clan_members m where m.clan_id = rim_zladen_clans.id and m.user_id = new.sender_id
      ));
    end if;
    if not found then
      v_reply := 'Клан не найден или его информация закрыта.';
    else
      select count(*) into v_members from public.rim_zladen_clan_members where clan_id = v_clan.id;
      v_reply := v_clan.emblem || ' ' || v_clan.name || ' (@' || v_clan.slug || ')' || E'\n' ||
        coalesce(nullif(v_clan.description, ''), 'Без описания.') || E'\n' ||
        'Участников: ' || v_members::text || E'\n' ||
        'Доступ: ' || case when v_clan.is_public then 'публичный' else 'по приглашению' end || E'\n' ||
        'Владелец ID: ' || v_clan.owner_id::text;
    end if;

  elsif v_action = 'top' then
    select string_agg(rn::text || '. ' || name || ' (@' || slug || ') — ' || member_count::text || ' уч.', E'\n' order by rn)
    into v_lines
    from (
      select row_number() over(order by count(m.user_id) desc, c.created_at asc) rn,
        c.name, c.slug, count(m.user_id) member_count
      from public.rim_zladen_clans c
      left join public.rim_zladen_clan_members m on m.clan_id = c.id
      where c.is_public is true
      group by c.id
      order by count(m.user_id) desc, c.created_at asc
      limit 10
    ) ranked;
    v_reply := 'Топ публичных кланов:' || E'\n' || coalesce(v_lines, 'Пока нет публичных кланов.');

  elsif v_action = 'visibility' then
    v_role := lower(split_part(v_rest, ' ', 2));
    update public.rim_zladen_clans c set is_public = (v_role = 'public'), updated_at = now()
    where c.owner_id = new.sender_id and exists (
      select 1 from public.rim_zladen_clan_members m where m.clan_id = c.id and m.user_id = new.sender_id and m.clan_role = 'leader'
    ) and v_role in ('public', 'private')
    returning * into v_clan;
    if found then v_reply := 'Доступ клану «' || v_clan.name || '» изменён: ' || v_role || '.';
    else v_reply := 'Формат: /clan visibility public|private. Команда доступна владельцу.'; end if;

  elsif v_action = 'kick' then
    begin v_target := split_part(v_rest, ' ', 2)::uuid; exception when others then v_target := null; end;
    select c.* into v_clan from public.rim_zladen_clans c
    join public.rim_zladen_clan_members m on m.clan_id = c.id
    where m.user_id = new.sender_id and m.clan_role in ('leader', 'deputy')
    order by m.joined_at desc limit 1;
    if not found or v_target is null or v_target = v_clan.owner_id then
      v_reply := 'Формат: /clan kick UUID. Нельзя исключить владельца.';
    else
      delete from public.rim_zladen_clan_members where clan_id = v_clan.id and user_id = v_target;
      if found then v_reply := 'Участник исключён из клана «' || v_clan.name || '».';
      else v_reply := 'Участник не найден в твоём клане.'; end if;
    end if;

  elsif v_action = 'promote' then
    begin v_target := split_part(v_rest, ' ', 2)::uuid; exception when others then v_target := null; end;
    select c.* into v_clan from public.rim_zladen_clans c
    where c.owner_id = new.sender_id;
    if not found or v_target is null then
      v_reply := 'Назначать заместителей может только лидер. Формат: /clan promote UUID.';
    else
      update public.rim_zladen_clan_members set clan_role = 'deputy'
      where clan_id = v_clan.id and user_id = v_target and clan_role = 'member';
      if found then v_reply := 'Участник назначен заместителем владельца клана.';
      else v_reply := 'Участник не найден или уже имеет повышенную роль.'; end if;
    end if;

  elsif v_action = 'delete' then
    select c.* into v_clan from public.rim_zladen_clans c where c.owner_id = new.sender_id;
    if not found then
      v_reply := 'Удалить клан может только его владелец.';
    else
      select count(*) into v_members from public.rim_zladen_clan_members where clan_id = v_clan.id;
      if v_members > 1 then v_reply := 'Перед удалением исключи остальных участников. Сейчас в клане: ' || v_members::text || '.';
      else delete from public.rim_zladen_clans where id = v_clan.id; v_reply := 'Клан «' || v_clan.name || '» удалён.'; end if;
    end if;

  else
    v_reply := 'Неизвестная команда клана. Напиши /clan help.';
  end if;

  if coalesce(v_reply, '') <> '' then
    insert into public.chat_messages(conversation_id, sender_id, body, client_message_id)
    values (new.conversation_id, v_bot.bot_user_id, left(v_reply, 4000), 'zladen-clan:' || new.id::text)
    on conflict (sender_id, client_message_id) do nothing;
    update public.conversations set last_message_at = now() where id = new.conversation_id;
  end if;
  return new;
end;
$$;

revoke all on function private.rim_zladen_handle_clan_commands() from public, anon, authenticated;
drop trigger if exists rim_zladen_handle_clan_commands on public.chat_messages;
create trigger rim_zladen_handle_clan_commands
after insert on public.chat_messages
for each row execute function private.rim_zladen_handle_clan_commands();

comment on table public.rim_zladen_clan_invites is 'Hashed, expiring Zladen clan invitations. Raw invite codes are only returned once in the bot reply.';
comment on function private.rim_zladen_handle_clan_commands() is 'Zladen clan lifecycle command handler. Never processes E2E-required conversations.';
