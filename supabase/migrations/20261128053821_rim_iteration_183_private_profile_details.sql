create table if not exists public.profile_private_details (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_private_details_birth_date_check
    check (birth_date is null or (birth_date >= date '1900-01-01' and birth_date <= current_date))
);

alter table public.profile_private_details enable row level security;

drop policy if exists "Users manage own private profile details" on public.profile_private_details;
create policy "Users manage own private profile details"
on public.profile_private_details
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update, delete on public.profile_private_details to authenticated;

comment on table public.profile_private_details is
  'Private account-only profile attributes. Birth date is intentionally not stored in the publicly readable profiles table.';
