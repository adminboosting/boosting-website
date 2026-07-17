-- ============================================================================
-- 0009 — Booster availability config.
-- A single site_settings row that powers the site-wide "boosters available"
-- counts (per game + total). Seeded in "manual" mode with placeholder numbers;
-- admin-editable in /admin/settings, and flippable to "live" mode (derived from
-- booster_profiles) once real boosters onboard. Idempotent: safe to re-run and
-- won't clobber counts an admin has already edited.
-- ============================================================================

insert into public.site_settings (key, value)
values (
  'booster_availability',
  '{"mode":"manual","counts":{"league-of-legends":6,"valorant":4,"overwatch-2":3,"marvel-rivals":3}}'::jsonb
)
on conflict (key) do nothing;
