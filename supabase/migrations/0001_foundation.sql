-- ============================================================================
-- 0001 — Foundation: enums, RLS helpers, profiles, site settings, FAQs.
-- All pricing/data introduced across these migrations is PLACEHOLDER — the admin
-- reviews it before launch (site_settings.pricing_reviewed).
--
-- RLS is enabled on EVERY table in the same migration that creates it (spec B2).
-- Policies use public.app_current_role() (spec A6) — never the Postgres built-in
-- current_role. On real Supabase, the auth schema, auth.uid(), and the anon/
-- authenticated/service_role roles already exist; locally the test shim provides
-- them (tests/db/helpers/supabase-shim.sql).
--
-- Ordering matters: a `language sql` function body is validated at CREATE time
-- (check_function_bodies), so any table a function reads must be created first.
-- ============================================================================

-- --- Enums ------------------------------------------------------------------
create type app_role as enum ('customer', 'booster', 'admin');
create type service_type as enum ('rank_boost', 'placements', 'net_wins');
create type order_mode as enum ('piloted', 'duo');
create type modifier_kind as enum ('percent', 'flat');
create type coupon_kind as enum ('percent', 'flat');
create type placement_band as enum ('unranked_low', 'mid', 'high');
create type net_win_group as enum ('low', 'mid', 'high', 'elite');
create type order_status as enum (
  'pending_payment', 'paid', 'assigned', 'in_progress',
  'paused', 'completed', 'cancelled', 'refunded'
);
create type payment_provider as enum ('nowpayments', 'stripe_test', 'manual');
create type payment_status as enum ('created', 'pending', 'confirmed', 'failed', 'refunded');
create type loyalty_entry_kind as enum ('earn', 'spend', 'adjust');
create type payout_status as enum ('requested', 'approved', 'paid', 'rejected');
create type referral_status as enum ('pending', 'qualified', 'rewarded', 'void');

-- Generic updated_at maintainer (plpgsql — parsed at runtime, no table deps).
create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- --- profiles (created before the role helpers that read it) ----------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role app_role not null default 'customer',
  display_name text,
  email text,
  lifetime_spend_cents bigint not null default 0 check (lifetime_spend_cents >= 0),
  store_credit_cents bigint not null default 0 check (store_credit_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- --- Role helpers -----------------------------------------------------------

-- The current user's APP role (customer/booster/admin), or 'anon' when signed
-- out. security definer so the profiles lookup isn't itself blocked by RLS.
-- Named app_current_role() to avoid shadowing the Postgres built-in current_role.
create or replace function public.app_current_role()
  returns text
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(
    (select p.role::text from public.profiles p where p.id = auth.uid()),
    'anon'
  );
$$;

create or replace function public.is_admin()
  returns boolean
  language sql
  stable
as $$ select public.app_current_role() = 'admin' $$;

-- --- profiles policies + guards (now that is_admin exists) ------------------

-- A user sees their own profile; admins see all.
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- A user may update their own profile; admins any.
create policy profiles_update_self_or_admin on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Prevent privilege escalation: a signed-in customer/booster (PostgREST role
-- `authenticated`) may not change any profile's role. Server-side contexts
-- (service role, migrations/seeds) and admins are trusted. NOT security definer,
-- so current_user reflects the actual caller, not the function owner.
create or replace function public.guard_profile_role()
  returns trigger
  language plpgsql
as $$
begin
  if new.role is distinct from old.role
     and current_user = 'authenticated'
     and not public.is_admin() then
    raise exception 'only admins may change a profile role';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- Auto-create a profile when an auth user is created (Supabase pattern). The
-- first user whose email matches ADMIN_BOOTSTRAP_EMAIL is promoted in app code
-- (Phase 2), not here.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- site_settings (key/value, includes pricing settings jsonb) -------------
create table public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;
grant select on public.site_settings to anon, authenticated;
grant all on public.site_settings to service_role;

create policy site_settings_select_all on public.site_settings
  for select to anon, authenticated using (true);
create policy site_settings_write_admin on public.site_settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- --- faqs -------------------------------------------------------------------
create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.faqs enable row level security;
grant select on public.faqs to anon, authenticated;
grant all on public.faqs to service_role;

create policy faqs_select_published on public.faqs
  for select to anon, authenticated
  using (is_published or public.is_admin());
create policy faqs_write_admin on public.faqs
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
