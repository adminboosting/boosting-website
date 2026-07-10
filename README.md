# RankedFrogs

> **RankedFrogs** (rankedfrogs.com) is the brand. The name is sourced from a
> single constant, `BRAND_NAME` in [`lib/config.ts`](lib/config.ts), plus a
> `brand_name` row in `site_settings` once the database is wired. A future rename
> touches only that constant, that DB row, and the mascot artwork in
> [`components/brand/frog-mascot.tsx`](components/brand/frog-mascot.tsx).

A production-grade, **first-party game-boosting platform** (agency model: the
company sets prices; its own vetted boosters fulfill orders). Launch titles:
**League of Legends, Valorant, Overwatch 2, Marvel Rivals**. Services: Rank/Division
Boost, Placement Matches, Ranked Net Wins — in **Piloted** or **Duo/self-play** mode.

Built to run entirely on the **free tiers of Vercel + Supabase**. Payments are
crypto-first (NOWPayments sandbox in dev) plus Stripe **test mode only**. Five AI
features are scaffolded but **off by default** with deterministic fallbacks — no
paid API is required for the MVP.

---

## Tech stack

- **Next.js 16** (App Router, TypeScript strict) · React 19
- **Tailwind CSS v4** + shadcn/ui conventions · lucide-react
- **Supabase** — Postgres, Auth, Realtime, Storage (via `@supabase/ssr`)
- **Zod** validation · **Vitest** tests
- **Sentry** (error monitoring, env-gated) · **Vercel Analytics**
- **pnpm** · Vercel hosting · GitHub Actions CI

See [`DECISIONS.md`](DECISIONS.md) for exact pinned versions and rationale.

---

## Quickstart (local dev)

Requires **Node 20+** and **pnpm** (via corepack).

```bash
corepack enable pnpm          # one-time: makes `pnpm` available
pnpm install                  # install dependencies
cp .env.example .env.local    # then fill in values (see RUNBOOK.md)
pnpm dev                      # http://localhost:3000
```

The app runs in a **degraded but functional** mode with no real services
configured: the marketing site renders, Sentry stays inert, AI is off, and
payments default to the `manual` provider. Wiring Supabase and the rest is a
step-by-step, mostly point-and-click process in [`RUNBOOK.md`](RUNBOOK.md).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` | **Full gate:** typecheck + lint + tests, then `next build`, then the secret-leak grep. This is what Vercel runs on every deploy. |
| `pnpm build:next` | Just `next build` (fast, no gate) — for local iteration |
| `pnpm start` | Serve the production build |
| `pnpm typecheck` | `tsc --noEmit` across the repo |
| `pnpm lint` | ESLint (Next flat config) |
| `pnpm test` | Vitest fast suite: unit + non-DB integration |
| `pnpm test:db` | PGlite-backed DB tests (RLS, migrations, price parity) — no Docker |
| `pnpm verify` | Everything: typecheck + lint + `test` + `test:db` (the local gate) |
| `pnpm format` | Prettier write |
| `pnpm generate:key` | Print a fresh `CREDENTIAL_MASTER_KEY` (vault, §10) |
| `pnpm gen:seed` | Regenerate `supabase/seed.sql` from `lib/catalog/*` (single-sourced prices) |
| `pnpm check:secrets` | CI guard: assert no server secret leaked into the client bundle |
| `pnpm db:migrate` | Apply `supabase/migrations/*.sql` in order (needs `SUPABASE_DB_URL`) |
| `pnpm db:seed` | Load starter catalog data (idempotent; needs `SUPABASE_DB_URL`) |

## Continuous checks (dual setup)

Checks run in **two independent places** so a green deploy is never an accident:

1. **Vercel build gate (always on).** `pnpm build` is wired to run typecheck + lint
   + the fast test suite, then `next build`, then the secret-leak grep — and Vercel
   runs `build` (via `vercel-build`) on every push. If any check fails, the deploy
   fails. This works even without GitHub Actions.
2. **GitHub Actions (parked).** The full workflow (adds `pnpm test:db`) lives in
   [`.github/workflows-disabled/`](.github/workflows-disabled/) because the pushing
   account currently lacks the `workflow` OAuth scope. Activation is one-time — see
   that folder's README. Until then, Vercel's build is the effective gate and the
   full suite is run locally at each phase gate (`pnpm verify`).

## Repository layout

```
app/            Next.js App Router (marketing, auth, dashboard, booster, admin, api)
components/     UI (shadcn), brand, calculator, chat, trust, admin
lib/            config, supabase clients, pricing engine, vault, payments, ai, schemas
emails/         react-email templates
supabase/       migrations/, seed.sql, config.toml
scripts/        generate-key, check-client-secrets, migrate + seed runner (scripts/lib)
tests/          unit/, integration/, db/ (PGlite-backed RLS + migration tests)
```

## Build phases

Work proceeds phase by phase; `main` stays deployable at every gate.

- **Phase 0 — Foundation** ✅ scaffold, toolchain, CI, deployable placeholder home
- **Phase 1 — Data + pricing + public calculator** (server-authoritative pricing, SEO)
- **Phase 2 — Auth + orders + payments + credential vault**
- **Phase 3 — Customer / booster / admin surfaces + realtime chat**
- **Phase 4 — Loyalty, referrals, trust, deterministic "AI" fallbacks, polish**

## Notes for the owner

- **Free to run:** the whole stack targets Vercel + Supabase free tiers. A daily
  GitHub Action keeps the Supabase project from pausing during development.
- **Ads caveat:** paid search for boosting is frequently disapproved by Google.
  Plan on organic SEO + Discord + affiliates rather than Google Ads.
- **Before launch:** set final prices and flip `site_settings.pricing_reviewed`,
  and have the (placeholder) legal pages reviewed by a lawyer. The admin panel will
  nag you about both.

## Security posture (summary)

- All money is **integer cents, USD**; pricing is **server-authoritative**.
- Supabase **Row Level Security** on every table; the service-role key is server-only
  and CI greps the client bundle to prove it never leaks.
- Game credentials are **encrypted app-side** (AES-256-GCM), access-logged, and
  auto-deleted after completion; never logged, never sent to Sentry.
