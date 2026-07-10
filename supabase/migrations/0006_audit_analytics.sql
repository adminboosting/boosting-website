-- ============================================================================
-- 0006 — Audit log + analytics. Written server-side (service role); read by
-- admins only. No anon/authenticated writes (avoids tampering/spam).
-- ============================================================================

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

alter table public.audit_log enable row level security;
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
create policy audit_log_admin_read on public.audit_log
  for select to authenticated using (public.is_admin());

-- Generic product analytics events (custom events beyond Vercel Analytics).
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  props jsonb,
  user_id uuid references public.profiles (id) on delete set null,
  session_id text,
  created_at timestamptz not null default now()
);
create index analytics_events_name_idx on public.analytics_events (name, created_at);

alter table public.analytics_events enable row level security;
grant select on public.analytics_events to authenticated;
grant all on public.analytics_events to service_role;
create policy analytics_events_admin_read on public.analytics_events
  for select to authenticated using (public.is_admin());

-- Anonymized calculator/quote events, for the (much later) AI pricing-insights
-- cron. No PII — just the selections and the computed total.
create table public.quote_events (
  id uuid primary key default gen_random_uuid(),
  game_slug text,
  service_type service_type,
  config jsonb,
  total_cents int,
  created_at timestamptz not null default now()
);
create index quote_events_created_idx on public.quote_events (created_at);

alter table public.quote_events enable row level security;
grant select on public.quote_events to authenticated;
grant all on public.quote_events to service_role;
create policy quote_events_admin_read on public.quote_events
  for select to authenticated using (public.is_admin());
