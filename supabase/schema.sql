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

-- Subscriptions table
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan varchar not null default 'free', -- free, pro, enterprise
  status varchar not null default 'active', -- active, cancelled, paused
  stripe_subscription_id varchar,
  stripe_customer_id varchar,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

create policy "Users can read own subscription"
on public.subscriptions
for select
using (auth.uid() = user_id);

create policy "Users can insert own subscription"
on public.subscriptions
for insert
with check (auth.uid() = user_id);

create policy "Users can update own subscription"
on public.subscriptions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan varchar not null,
  amount integer not null,
  phone_number varchar not null,
  status varchar not null default 'pending',
  merchant_request_id varchar,
  checkout_request_id varchar,
  mpesa_receipt_number varchar,
  result_code integer,
  result_desc text,
  callback_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_subscription_payments_updated_at
before update on public.subscription_payments
for each row
execute function public.set_updated_at();

alter table public.subscription_payments enable row level security;

create policy "Users can read own subscription payments"
on public.subscription_payments
for select
using (auth.uid() = user_id);

create policy "Users can insert own subscription payments"
on public.subscription_payments
for insert
with check (auth.uid() = user_id);

-- Plan limits configuration (stored in a table for easy updates)
create table if not exists public.plan_limits (
  plan varchar primary key,
  max_invoices_per_month integer,
  max_expenses_per_month integer,
  max_customers integer,
  price_cents integer,
  features jsonb
);

insert into public.plan_limits (plan, max_invoices_per_month, max_expenses_per_month, max_customers, price_cents, features) values
  ('free', 10, 20, 5, 0, '{"whatsapp": false, "cloud_sync": true, "reports": true, "vat_tracking": false}'),
  ('pro', 100, 200, 50, 29900, '{"whatsapp": true, "cloud_sync": true, "reports": true, "vat_tracking": true}'),
  ('enterprise', null, null, null, 79900, '{"whatsapp": true, "cloud_sync": true, "reports": true, "vat_tracking": true, "teams": true, "api": true}')
on conflict (plan) do nothing;
