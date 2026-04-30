create table if not exists public.app_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_app_data_updated_at on public.app_data;

create trigger set_app_data_updated_at
before update on public.app_data
for each row
execute function public.set_updated_at();

alter table public.app_data enable row level security;

create policy "Users can read own app data"
on public.app_data
for select
using (auth.uid() = user_id);

create policy "Users can insert own app data"
on public.app_data
for insert
with check (auth.uid() = user_id);

create policy "Users can update own app data"
on public.app_data
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
