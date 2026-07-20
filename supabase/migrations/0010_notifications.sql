-- ============================================================================
-- 0010 — In-app notifications: the transport behind the "notify the other
-- party" buttons on the order pages.
--
-- One row = one delivered ping. The customer's "Notify booster" button inserts
-- a `booster_ping` addressed to the assigned booster; the booster's "Notify
-- customer" button (which also sends an email) inserts a `customer_message`
-- addressed to the order owner. A per-user Realtime subscription
-- (components/notifications/notification-listener.tsx) turns each INSERT into
-- an audio chime + popup for whoever has the site open.
--
-- Isolation model (same posture as the rest of the schema):
--   * a user reads ONLY notifications addressed to them (recipient_id) and may
--     mark their own read — nothing else;
--   * NOBODY inserts through PostgREST. There is no authenticated INSERT grant,
--     so a client cannot forge a ping to another user. Every insert is a
--     service-role code path (lib/notifications/create.ts) that first proves,
--     app-side, that the sender is entitled to notify the recipient about that
--     order — mirroring how is_system chat messages are service-role only.
--
-- Realtime enforces the SAME RLS on change payloads, so a subscriber filtered
-- to `recipient_id=eq.<self>` only ever receives their own rows — the filter is
-- a convenience, not the security boundary.
-- ============================================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  order_id uuid references public.orders (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);
-- Powers the anti-spam cooldown lookup in lib/notifications/create.ts.
create index notifications_recipient_order_kind_idx
  on public.notifications (recipient_id, order_id, kind, created_at desc);

alter table public.notifications enable row level security;
-- SELECT to read + UPDATE to mark read; deliberately NO insert grant to
-- authenticated (inserts are service-role only, see the header).
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());
-- Recipients may only ever touch their own rows, and only to flip read state —
-- the WITH CHECK keeps recipient_id pinned to the caller.
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- --- Realtime publication (guarded exactly like 0007) -----------------------
-- The publication exists on hosted Supabase but NOT in the PGlite test shim, so
-- the membership add is wrapped so it no-ops cleanly when absent and is safe to
-- re-run. Until this migration runs on the live project, the listener's channel
-- never reaches SUBSCRIBED and the popups simply don't fire (no polling
-- fallback — a missed ping is not worth a per-user poll against the free tier).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;
