-- RIM 3.0 Lite Writer storage
-- Safe, additive migration. Does not alter or delete existing application data.
-- Review and apply manually to the intended Supabase project.

create table if not exists public.rim_writer_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Без названия',
  content text not null default '',
  folder text not null default 'Основное',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rim_writer_documents_user_updated_idx
  on public.rim_writer_documents (user_id, updated_at desc);

alter table public.rim_writer_documents enable row level security;

drop policy if exists "rim_writer_documents_select_own" on public.rim_writer_documents;
create policy "rim_writer_documents_select_own"
  on public.rim_writer_documents for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "rim_writer_documents_insert_own" on public.rim_writer_documents;
create policy "rim_writer_documents_insert_own"
  on public.rim_writer_documents for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "rim_writer_documents_update_own" on public.rim_writer_documents;
create policy "rim_writer_documents_update_own"
  on public.rim_writer_documents for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "rim_writer_documents_delete_own" on public.rim_writer_documents;
create policy "rim_writer_documents_delete_own"
  on public.rim_writer_documents for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.rim_writer_documents to authenticated;
revoke all on public.rim_writer_documents from anon;
