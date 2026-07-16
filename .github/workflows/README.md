# GitHub Actions workflows

Activated on 2026-07-16 (the `gh` login now has the `workflow` scope).

- `ci.yml` — install, lint, typecheck, test, build, and the client-secret leak
  guard. Runs on every push/PR alongside Vercel's own build.
- `supabase-keepalive.yml` — daily ping so the free Supabase project doesn't
  pause after ~1 week of inactivity. Reads the repo Actions secrets
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (both are
  public-by-design client values; they live in secrets only to keep them out
  of the workflow file).
