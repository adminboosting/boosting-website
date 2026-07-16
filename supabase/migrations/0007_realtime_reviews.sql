-- ============================================================================
-- 0007 — Realtime publication for order chat/progress + review moderation.
--
-- Part 1: add `order_messages` and `order_progress` to the `supabase_realtime`
-- publication so `postgres_changes` events fire for the order chat and the
-- progress timeline. Notes:
--   * Realtime enforces the SAME RLS on change payloads — a subscriber only
--     receives rows can_access_order() lets them SELECT, so a revoked booster's
--     channel simply goes silent. No extra auth surface is added here.
--   * Replica identity stays at the default (both tables have uuid PKs); only
--     INSERT events are consumed by the app.
--   * `message_reads` is deliberately NOT published: receipts are self-scoped
--     (a user can only ever see their own rows), so there is nothing to push —
--     unread counts refresh on focus/navigation instead.
--   * Free-tier budget (200 concurrent connections / 2M messages a month): the
--     app subscribes one channel per MOUNTED order detail page and unsubscribes
--     on unmount — no global or presence channels.
--   * The publication exists on hosted Supabase but NOT in the PGlite test
--     environment (tests/db/helpers/supabase-shim.sql), so the block below is
--     guarded: it no-ops cleanly when `supabase_realtime` is absent. The
--     membership checks also make a manual re-run harmless.
--   * RUNBOOK.md has the owner-facing verification step (Database →
--     Publications in the dashboard) — until this migration runs on the live
--     project, chat degrades to the component's polling fallback.
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'order_messages'
    ) then
      alter publication supabase_realtime add table public.order_messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'order_progress'
    ) then
      alter publication supabase_realtime add table public.order_progress;
    end if;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Part 2: review moderation. 0004 let an author INSERT/UPDATE their own review
-- with any column values — nothing stopped self-setting `is_published = true`.
-- Replace both policies with versions whose WITH CHECK adds
-- `(is_published = false or public.is_admin())`: authors can still write and
-- edit their review, but only an admin can publish (or edit a published row
-- while keeping it published). The server action additionally hardcodes
-- `is_published: false` — the app never trusts the client for this flag.
-- ----------------------------------------------------------------------------

drop policy reviews_insert_own_completed on public.reviews;
create policy reviews_insert_own_completed on public.reviews
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid() and o.status = 'completed'
    )
    and (is_published = false or public.is_admin())
  );

drop policy reviews_update_own_or_admin on public.reviews;
create policy reviews_update_own_or_admin on public.reviews
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (
    (user_id = auth.uid() or public.is_admin())
    and (is_published = false or public.is_admin())
  );
