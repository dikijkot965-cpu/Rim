-- Additive migration: no existing rows are deleted or rewritten.
-- Telegram identities are private server-managed mappings; client_message_id
-- provides exactly-once message creation semantics for retrying offline sends.

create table if not exists public.rim_auth_identities (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('telegram', 'google', 'github', 'vk')),
  provider_subject text not null,
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'provisioning' check (status in ('provisioning', 'active')),
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rim_auth_identities_provider_subject_key unique (provider, provider_subject)
);

create unique index if not exists rim_auth_identities_provider_user_key
  on public.rim_auth_identities(provider, user_id)
  where user_id is not null;

alter table public.rim_auth_identities enable row level security;
revoke all on table public.rim_auth_identities from public, anon, authenticated;
grant all on table public.rim_auth_identities to service_role;

alter table public.chat_messages
  add column if not exists client_message_id text;

alter table public.chat_messages
  add constraint chat_messages_client_message_id_length_check
  check (client_message_id is null or char_length(client_message_id) between 1 and 128);

create unique index if not exists chat_messages_sender_client_message_id_key
  on public.chat_messages(sender_id, client_message_id);
