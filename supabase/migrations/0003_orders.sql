-- ============================================================================
-- 0003 — Order lifecycle: orders, assignments, credentials (deny-all), the
-- credential access log, chat messages + read receipts, progress events, and the
-- allowed status-transition table.
--
-- Nothing here is wired to checkout/payments yet (that's Phase 2 per the roadmap,
-- spec B4) — these are the tables + RLS + the transition map, defined now.
--
-- Isolation model (proven by tests/db/rls-isolation.test.ts):
--   * a customer reads only their own orders and their orders' messages/progress;
--   * an assigned booster reads the orders assigned to them;
--   * NOBODY reads order_credentials via PostgREST — only server code using the
--     service role, after an explicit ownership/assignment check in app code.
--
-- Tables are created before can_access_order() because a `language sql` function
-- body is validated against its referenced tables at CREATE time.
-- ============================================================================

-- --- orders -----------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_slug text not null references public.games (slug),
  service_type service_type not null,
  mode order_mode not null,
  region_code text not null,
  config jsonb not null, -- camelCase QuoteConfig (see DECISIONS)
  status order_status not null default 'pending_payment',
  subtotal_cents int not null check (subtotal_cents >= 0),
  discount_cents int not null default 0 check (discount_cents >= 0),
  store_credit_applied_cents int not null default 0 check (store_credit_applied_cents >= 0),
  total_cents int not null check (total_cents >= 0),
  currency text not null default 'USD',
  eta_hours double precision,
  coupon_code text references public.coupons (code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index orders_user_idx on public.orders (user_id);
create index orders_status_idx on public.orders (status);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;
grant select, insert, update on public.orders to authenticated;
grant all on public.orders to service_role;

-- --- order_assignments ------------------------------------------------------
create table public.order_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  booster_id uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  is_active boolean not null default true
);
create unique index order_assignments_one_active
  on public.order_assignments (order_id) where is_active;

alter table public.order_assignments enable row level security;
grant select on public.order_assignments to authenticated;
grant all on public.order_assignments to service_role;

-- Order participation, security definer to avoid RLS recursion between orders
-- and order_assignments. Created now that both tables exist.
create or replace function public.can_access_order(o_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.orders o
    where o.id = o_id and (
      o.user_id = auth.uid()
      or public.is_admin()
      or exists (
        select 1 from public.order_assignments a
        where a.order_id = o.id and a.booster_id = auth.uid() and a.is_active
      )
    )
  );
$$;

-- Uses the security-definer can_access_order() helper (owner OR admin OR active
-- assigned booster) rather than an inline subquery on order_assignments — that
-- would mutually trigger each table's RLS and recurse.
create policy orders_select_participants on public.orders
  for select to authenticated
  using (public.can_access_order(id));
create policy orders_insert_own on public.orders
  for insert to authenticated
  with check (user_id = auth.uid());
create policy orders_update_owner_or_staff on public.orders
  for update to authenticated
  using (public.can_access_order(id))
  with check (public.can_access_order(id));

-- A booster sees their own assignment rows; the order owner and admins see an
-- order's assignments via can_access_order() (definer — no recursion).
create policy order_assignments_select on public.order_assignments
  for select to authenticated
  using (booster_id = auth.uid() or public.can_access_order(order_id));
-- Assigning is an admin/ops action (or the service role). Boosters self-claiming
-- is Phase 3; keep writes admin-only for now.
create policy order_assignments_write_admin on public.order_assignments
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- --- order_credentials (DENY ALL to PostgREST) ------------------------------
-- Piloted logins, encrypted app-side (AES-256-GCM) before insert. RLS is enabled
-- with NO policies and NO grant to anon/authenticated, so PostgREST returns
-- nothing for either role. Only the service role (server code) can touch it, and
-- only after an explicit ownership/assignment check in app code.
create table public.order_credentials (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  algo text not null default 'aes-256-gcm',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.order_credentials enable row level security;
alter table public.order_credentials force row level security;
revoke all on public.order_credentials from anon, authenticated;
grant all on public.order_credentials to service_role;
-- (no policies on purpose)

-- --- credential_access_log --------------------------------------------------
create table public.credential_access_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  credential_id uuid references public.order_credentials (id) on delete set null,
  accessed_by uuid references public.profiles (id),
  action text not null,
  ip text,
  accessed_at timestamptz not null default now()
);
alter table public.credential_access_log enable row level security;
grant select on public.credential_access_log to authenticated;
grant all on public.credential_access_log to service_role;
create policy credential_access_log_admin_read on public.credential_access_log
  for select to authenticated using (public.is_admin());

-- --- order_messages + reads -------------------------------------------------
create table public.order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  sender_id uuid references public.profiles (id),
  body text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
create index order_messages_order_idx on public.order_messages (order_id, created_at);

alter table public.order_messages enable row level security;
grant select, insert on public.order_messages to authenticated;
grant all on public.order_messages to service_role;

create policy order_messages_select_participants on public.order_messages
  for select to authenticated using (public.can_access_order(order_id));
create policy order_messages_insert_participants on public.order_messages
  for insert to authenticated
  with check (public.can_access_order(order_id) and (sender_id = auth.uid() or public.is_admin()));

create table public.message_reads (
  message_id uuid not null references public.order_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.message_reads enable row level security;
grant select, insert, update on public.message_reads to authenticated;
grant all on public.message_reads to service_role;
create policy message_reads_own on public.message_reads
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --- order_progress ---------------------------------------------------------
create table public.order_progress (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  status_from order_status,
  status_to order_status not null,
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index order_progress_order_idx on public.order_progress (order_id, created_at);

alter table public.order_progress enable row level security;
grant select, insert on public.order_progress to authenticated;
grant all on public.order_progress to service_role;

create policy order_progress_select_participants on public.order_progress
  for select to authenticated using (public.can_access_order(order_id));
create policy order_progress_insert_staff on public.order_progress
  for insert to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.order_assignments a
      where a.order_id = order_progress.order_id and a.booster_id = auth.uid() and a.is_active
    )
  );

-- --- order_status_transitions (allowed transition map) ----------------------
create table public.order_status_transitions (
  from_status order_status not null,
  to_status order_status not null,
  primary key (from_status, to_status)
);
alter table public.order_status_transitions enable row level security;
grant select on public.order_status_transitions to anon, authenticated;
grant all on public.order_status_transitions to service_role;
create policy order_status_transitions_read on public.order_status_transitions
  for select to anon, authenticated using (true);
create policy order_status_transitions_write_admin on public.order_status_transitions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.order_status_transitions (from_status, to_status) values
  ('pending_payment', 'paid'),
  ('pending_payment', 'cancelled'),
  ('paid', 'assigned'),
  ('paid', 'cancelled'),
  ('paid', 'refunded'),
  ('assigned', 'in_progress'),
  ('assigned', 'paused'),
  ('assigned', 'cancelled'),
  ('in_progress', 'paused'),
  ('in_progress', 'completed'),
  ('in_progress', 'cancelled'),
  ('paused', 'in_progress'),
  ('paused', 'cancelled'),
  ('completed', 'refunded');
