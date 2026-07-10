-- ============================================================================
-- 0005 — Booster operations: booster profiles, earnings, payouts.
-- Defined now; the booster surfaces that use them are Phase 3.
-- ============================================================================

create table public.booster_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  display_name text,
  bio text,
  games text[] not null default '{}',
  rating_avg double precision not null default 0,
  orders_completed int not null default 0,
  is_accepting boolean not null default true,
  cut_bp int not null default 7000,
  created_at timestamptz not null default now()
);
alter table public.booster_profiles enable row level security;
grant select, update on public.booster_profiles to authenticated;
grant all on public.booster_profiles to service_role;

create policy booster_profiles_select_self_or_admin on public.booster_profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy booster_profiles_update_self_or_admin on public.booster_profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create table public.booster_earnings (
  id uuid primary key default gen_random_uuid(),
  booster_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  amount_cents int not null check (amount_cents >= 0),
  status text not null default 'accrued',
  created_at timestamptz not null default now()
);
create index booster_earnings_booster_idx on public.booster_earnings (booster_id, created_at);

alter table public.booster_earnings enable row level security;
grant select on public.booster_earnings to authenticated;
grant all on public.booster_earnings to service_role;

create policy booster_earnings_select_own on public.booster_earnings
  for select to authenticated
  using (booster_id = auth.uid() or public.is_admin());

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  booster_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents int not null check (amount_cents >= 0),
  method text,
  status payout_status not null default 'requested',
  reference text,
  requested_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.payouts enable row level security;
grant select, insert on public.payouts to authenticated;
grant all on public.payouts to service_role;

create policy payouts_select_own on public.payouts
  for select to authenticated
  using (booster_id = auth.uid() or public.is_admin());
create policy payouts_request_own on public.payouts
  for insert to authenticated
  with check (booster_id = auth.uid() and status = 'requested');
