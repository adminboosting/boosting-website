-- ============================================================================
-- 0004 — Commerce: payments, reviews, loyalty ledger, referrals.
-- Defined now; checkout/webhooks that write payments are Phase 2.
-- ============================================================================

-- --- payments ---------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider payment_provider not null,
  provider_ref text,
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'USD',
  status payment_status not null default 'created',
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
grant select on public.payments to authenticated;
grant all on public.payments to service_role;

-- Customers see payments on their own orders; admins all. Writes come from
-- server-side webhook handlers using the service role.
create policy payments_select_owner_or_admin on public.payments
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

-- --- reviews ----------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
create index reviews_published_idx on public.reviews (is_published, created_at);

alter table public.reviews enable row level security;
grant select on public.reviews to anon, authenticated;
grant insert, update on public.reviews to authenticated;
grant all on public.reviews to service_role;

-- Published reviews are public (real reviews only — no fabricated testimonials,
-- and no self-serving aggregateRating schema is ever emitted, per spec).
create policy reviews_select_published on public.reviews
  for select to anon, authenticated
  using (is_published or user_id = auth.uid() or public.is_admin());
-- A customer may review only their own completed order.
create policy reviews_insert_own_completed on public.reviews
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid() and o.status = 'completed'
    )
  );
create policy reviews_update_own_or_admin on public.reviews
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- --- loyalty_ledger ---------------------------------------------------------
create table public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  kind loyalty_entry_kind not null,
  amount_cents bigint not null,
  balance_after_cents bigint not null,
  note text,
  created_at timestamptz not null default now()
);
create index loyalty_ledger_user_idx on public.loyalty_ledger (user_id, created_at);

alter table public.loyalty_ledger enable row level security;
grant select on public.loyalty_ledger to authenticated;
grant all on public.loyalty_ledger to service_role;

create policy loyalty_ledger_select_own on public.loyalty_ledger
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- --- referrals --------------------------------------------------------------
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  referred_id uuid references public.profiles (id) on delete set null,
  code text not null unique,
  status referral_status not null default 'pending',
  reward_cents int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.referrals enable row level security;
grant select on public.referrals to authenticated;
grant all on public.referrals to service_role;

create policy referrals_select_participants on public.referrals
  for select to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid() or public.is_admin());
