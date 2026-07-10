# Decisions Log

Records implementation choices, resolved dependency versions, and any deviations
from the build spec. Append-only; newest phase at the bottom.

---

## Phase 0 — Foundation

**Checkpoint reached (gate met):** `pnpm build`, `pnpm typecheck`, `pnpm lint`,
`pnpm test`, `pnpm check:secrets`, and `pnpm install --frozen-lockfile` all pass
locally. A dark, themed placeholder home renders with the brand name sourced from
`BRAND_NAME`. Ready to deploy to Vercel.

### Resolved dependency versions (exact-pinned in package.json)

| Package | Version | | Package | Version |
| --- | --- | --- | --- | --- |
| next | 16.2.10 | | typescript | 6.0.3 |
| react | 19.2.7 | | @types/node | 26.1.0 |
| react-dom | 19.2.7 | | @types/react | 19.2.17 |
| @supabase/ssr | 0.12.0 | | @types/react-dom | 19.2.3 |
| @supabase/supabase-js | 2.110.0 | | tailwindcss | 4.3.2 |
| @sentry/nextjs | 10.63.0 | | @tailwindcss/postcss | 4.3.2 |
| @vercel/analytics | 2.0.1 | | postcss | 8.5.16 |
| zod | 4.4.3 | | eslint | 9.39.4 |
| lucide-react | 1.23.0 | | eslint-config-next | 16.2.10 |
| class-variance-authority | 0.7.1 | | vitest | 4.1.9 |
| clsx | 2.1.1 | | tsx | 4.23.0 |
| tailwind-merge | 3.6.0 | | prettier | 3.9.4 |
| | | | tw-animate-css | 1.4.0 |

**Toolchain:** Node 24.4.0 (local dev) / Node 20 (CI); pnpm 11.10.0 (via corepack,
pinned in `packageManager`).

### Deviations & notable choices (with rationale)

1. **ESLint pinned to 9.39.4, not the latest 10.x.** ESLint 10 removed the
   `context.getFilename()` API that `eslint-plugin-react` 7.37.5 (a transitive
   dependency of `eslint-config-next` 16) still calls, which crashes linting.
   ESLint 9 is what `eslint-config-next` 16 actually targets (peer `>=9`). Revisit
   when the Next ESLint plugin chain supports ESLint 10.

2. **`middleware.ts` → `proxy.ts`.** Next.js 16 deprecated the `middleware` file
   convention in favor of `proxy`. The root file is `proxy.ts` exporting `proxy()`;
   the Supabase session helper stays at `lib/supabase/middleware.ts` per spec.

3. **`eslint-config-next` imported as native flat config**, not via
   `@eslint/eslintrc` `FlatCompat`. v16 ships flat-config arrays at
   `eslint-config-next` / `/core-web-vitals` / `/typescript`. `@eslint/eslintrc`
   was removed as unused.

4. **Supabase CLI is NOT a project dependency.** Its npm package (`supabase`)
   OOM-crashes `pnpm add` on this machine (V8 heap abort while hashing its bundled
   binary). It is also not needed to build/run. Install it separately when applying
   migrations (Homebrew `supabase/tap/supabase`, the official install script, or
   `pnpm dlx supabase@<v>`). Documented in RUNBOOK.

5. **No local Supabase stack (no Docker).** Docker isn't installed and the owner
   wants a free, low-maintenance setup. Development targets the free **hosted**
   Supabase project. Migrations are applied via the Supabase dashboard SQL editor
   or `supabase db push` — see RUNBOOK. All schema lives in versioned SQL either way.

6. **TypeScript 6.0.3** (current stable). `noUncheckedIndexedAccess` and
   `noImplicitOverride` are enabled beyond `strict` for extra safety in the
   money/pricing code.

7. **Button uses a `buttonVariants` (cva) pattern** rather than Radix `Slot`/
   `asChild`, avoiding an extra dependency in Phase 0. Link-styled buttons apply
   `buttonVariants()` to a `<Link>`. Full shadcn components are added as needed.

8. **`next-env.d.ts` is committed** (removed from `.gitignore`) so `tsc --noEmit`
   works in CI without a prior `next build`. Next regenerates it harmlessly.

9. **Exact version pins applied manually.** `save-exact` in `.npmrc` was not honored
   by `pnpm add` (it wrote carets); versions were pinned by editing `package.json`
   and reconciling the lockfile. The lockfile is the reproducibility source of truth.

10. **Sentry, Analytics, Payments, Email, AI are all env-gated and inert by default.**
    With no keys set, Sentry never initializes, AI features take deterministic
    fallbacks, and payments default to the `manual` provider. Nothing requires a
    key to build, test, run, or deploy the MVP.

11. **`pnpm-workspace.yaml`** exists only to hold build-script approvals
    (`esbuild`, `sharp`, `unrs-resolver` built; `@sentry/cli` skipped since we never
    upload source maps on the free path). pnpm 11 no longer reads these from
    `package.json`.

12. **CI workflows are parked in `.github/workflows-disabled/`.** The repo owner's
    GitHub login (`adminboosting`) lacks the `workflow` OAuth scope, so GitHub
    rejects any push that writes under `.github/workflows/`. The two workflow files
    are preserved in a non-magic folder with activation instructions in its README.
    This is a one-time Phase-0 constraint (no later phase modifies workflow files).
    Vercel's build is the effective gate meanwhile. Activate GitHub Actions by
    granting the scope once and moving the files up a level.

---

## Phase 1 — Data + pricing + public calculator (in progress)

### Pricing engine + catalog (committed)

- **Static catalog is the single source of truth for placeholder pricing**
  (`lib/catalog/data.ts`). It powers the pure pricing engine directly, so the
  calculator works on the free tier with zero backend. Once Supabase is wired the
  DB overrides it (admin-editable); `supabase/seed.sql` will be generated from this
  same data so the two never drift.
- **`orders.config` jsonb uses camelCase keys** (`currentRankIndex`, not
  `current_rank_index`) — the client payload, engine, and DB jsonb all share one
  shape, avoiding snake/camel mapping. (Spec §6 showed snake_case illustratively.)
- **Placement/net-win base ETAs** aren't given in the spec; chosen placeholders:
  `0.8h` per placement game, `0.7h` per net win. Admin-editable later; recorded here
  per the "choose conventional, record, continue" rule.
- **Rounding:** half-up (`Math.floor(x + 0.5)`) at each multiply, integer cents
  throughout. Verified by golden-value unit tests (e.g. `1365 * 15% = 204.75 → 205`).
- **The lowest rank of each ladder** carries its tier price but is never summed as a
  step destination (steps start at `current+1`), so it's inert. Above-ceiling ranks
  are seeded as `isPurchasable: false` divisionless rows for the "contact us" state.
- **40 golden-value unit tests** cover all four games, cross-tier climbs, LoL LP
  proration/gain/Flex, every modifier, duo vs piloted, region highs/lows, coupon +
  loyalty + volume stacking with the 30% cap clamp, store-credit clamps, cashback
  preview, and every rejection path. A reconcile invariant asserts itemized lines
  always sum to the charged total.

### /api/quote + public calculator + SEO (committed)

- **`/api/quote`** validates the body with Zod (discriminated union on serviceType),
  computes via the engine, returns `PricingError` as a 400 with a code, sets
  `Cache-Control: no-store`. A route test proves attacker-supplied `totalCents`
  fields are stripped by the schema and the server value wins.
- **Public site restructured under `app/(marketing)/`** with a shared header/footer
  layout; the home page moved there. Money pages (`/[game]/[service]`) and game hubs
  (`/[game]`) are SSG via `generateStaticParams` with 1h ISR, so admin price/content
  edits (Phase 3) propagate. 12 money pages + 4 hubs prerender.
- **Calculator** is a client component: debounced (250ms) POST to `/api/quote`,
  itemized line rendering, ETA range (±20%), cashback preview, volume-discount nudge,
  coupon field, `aria-live` price announcements, keyboard-operable controls. Checkout
  button is disabled pending Phase 2. Used native selects/steppers for accessibility;
  a richer visual ladder is a Phase 4 polish item.
- **SEO:** per-page `generateMetadata` (canonical + OpenGraph), JSON-LD
  (Organization on root, BreadcrumbList + Product/Offer + FAQPage on money pages).
  Deliberately **no** self-serving AggregateRating/Review schema (post-2024 Google
  guidance) — reviews rely on Trustpilot. `sitemap.ts` enumerates all 25 URLs;
  `robots.ts` disallows private areas.
- **Legal pages** (`/legal/{terms,privacy,refund-policy}`) seeded with clearly
  labeled PLACEHOLDER, review-by-a-lawyer drafts covering non-affiliation, ToS-risk
  transparency, age requirement, credential encryption/auto-deletion, and refunds.

### Rebrand: RankForge → RankedFrogs (committed)

The owner finalized the brand as **RankedFrogs** (domain **rankedfrogs.com**), with a
**crowned-frog mascot**, **frog-green** accent, and a **balanced** tone (friendly, a
light pun or two, still professional). Because the name is single-sourced, the change
was: `BRAND_NAME` constant; theme accent (violet → green oklch(0.73 0.19 150), dark
foreground for contrast on green); a new `components/brand/frog-mascot.tsx` whose SVG
markup is the single source of truth for the header logo, favicon (`app/icon.svg`),
and social image (`app/opengraph-image.tsx`, rendered via `next/og`); light copy
tweaks ("Leap up the ranks…"); and doc/config brand references + the rankedfrogs.com
domain in RUNBOOK. Cyan retained as the cool secondary accent. Verified live: green
theme, mascot, favicon, and OG image all render; build/typecheck/lint/tests green.

---

## Continuation run — Phases A–D (hardening, DB, design, motion)

Plan for this run (worked in order, committing per logical unit, self-verifying at
each Gate): **A** verified fixes + hardening → **B** full DB schema + RLS + seed →
**C** de-genericized design system → **D** motion architecture + Claude Design
handoff. Server-authoritative pricing and RLS are never weakened for convenience;
everything stays on free tiers.

### Owner decisions captured at the start of this run (non-technical Q&A)

1. **Database: build + test locally now, connect live Supabase later.** No Docker,
   no account signup required now. We verify the whole DB layer against an
   in-process Postgres (PGlite) and leave the live-Supabase connection as the
   documented RUNBOOK steps. (Consistent with the earlier Phase-0 "no Docker,
   hosted Supabase" decision — this just adds a zero-setup *local test* path.)
2. **Look & feel (Phase C): "Bright lily-pond — light & fresh."** The redesign
   moves from today's dark theme to a **light-primary** system with frog-green as
   the hero color. Dark mode remains supported but light is the default. The AA
   guardrail becomes "green must pass AA on light" (dark-green text is fine); the
   boldness is spent on typography + one signature moment, not the palette.
3. **Reviews/trust band: clean "coming soon", ready for Trustpilot.** No fabricated
   reviews, no self-serving review/aggregateRating schema. The section is designed
   but visibly awaiting real data.

### Deviation — the `frontend-design` skill is not on this machine

The spec says to read `/mnt/skills/public/frontend-design/SKILL.md` before Phase C.
That path does not exist in this environment (it's from a different host). Substitute:
the equivalent design skills available here (`design:design-system`, `artifact-design`,
`dataviz`) plus the two-pass brainstorm→critique→revise method the spec itself
prescribes. Recorded so Phase C's provenance is clear.

### Phase A — resolved decisions

- **A1/A2 — `proxy.ts` is a redirect/UX layer, not a security boundary.** Confirmed
  root `proxy.ts` (no leftover `middleware.ts`), Next 16.2.10. Added a header comment
  stating it replaces `middleware.ts` as of Next 16 and encoding the **three-layer
  auth rule** as an enforceable written rule: (1) proxy may only *redirect*; (2) every
  Server Action / Route Handler independently verifies identity **and** resource
  ownership; (3) RLS is the final gate; credentials deny all PostgREST access. No
  protected action relies on proxy alone.
- **A3 — CI gate baked into the Vercel build.** `build` = `ci:checks && next build &&
  check:secrets`, where `ci:checks` = typecheck + lint + fast tests. `vercel-build`
  aliases `build` (Vercel honors it regardless of how it invokes the build); a
  `build:next` escape hatch runs `next build` alone for fast local iteration. The
  secret-leak grep (`check:secrets`, value-based — catches the real secret material
  for `SUPABASE_SERVICE_ROLE_KEY`, `CREDENTIAL_MASTER_KEY`, `ANTHROPIC_API_KEY`, and
  more) runs **after** `next build` since it scans `.next/static`. Verified: the whole
  chain runs and passes locally. Parked `.github/workflows-disabled/ci.yml` mirrors it
  (and now also runs `pnpm test:db`).
- **A4 — migration runner is node-postgres + a DB-agnostic core.** The Supabase CLI
  is not used (its npm package OOM-crashes here, per Phase 0). `scripts/lib/migrate-core.ts`
  is pure and driver-agnostic (talks to a `MigrationClient` interface), so the SAME
  logic runs against real Postgres/Supabase (`scripts/migrate.ts`, via `pg`, `pnpm
  db:migrate`) and against PGlite in tests. Forward-only, one transaction per
  migration (atomic rollback on failure), applied files tracked in `_schema_migrations`,
  idempotent. Seeds are separate and idempotent (`scripts/seed.ts`, `pnpm db:seed`).
  Proven by `tests/db/migrate-runner.test.ts` (ordering, idempotency, rollback).
- **A5 — single data-access layer `lib/catalog/source.ts`.** It is now the ONLY path
  the calculator, pages, sitemap, and footer read catalog data through; nothing else
  imports `lib/catalog/data.ts` (verified by grep). `data.ts` stays intact as the
  file-backed implementation (the 44 pricing tests still target it directly).
  **Kept synchronous in Phase A on purpose** — a pure import-swap keeps every existing
  test trivially green. Phase B flips `source.ts` internals to async DB-with-file-
  fallback and does the awaited cutover **guarded by the price-parity regression
  test**, which is exactly where the spec sequences that risk.
- **A6 — RLS role helper will be `app_current_role()`**, never `current_role` (avoids
  shadowing the Postgres built-in). All Phase B policies use this name. Recorded now,
  used in B.
- **A7 — one tested case mapper `lib/catalog/mapping.ts`.** Deep snake_case↔camelCase
  for DB rows ↔ app objects; keys listed in `preserveValueOf` (default `["config"]`)
  are copied verbatim in both directions so `orders.config` jsonb stays camelCase end
  to end. Covered by `tests/unit/mapping.test.ts` (conversion, nesting, arrays, Date
  pass-through, config preservation, round-trip identity).

### Phase A — resolved dependency versions & DB tooling

| Package | Version | Why |
| --- | --- | --- |
| `pg` | 8.22.0 | node-postgres — drives the real migration/seed runner |
| `@types/pg` | 8.20.0 | types for `pg` |
| `@electric-sql/pglite` | 0.5.4 | in-process Postgres 18 (WASM) for DB tests — no Docker |

**PGlite viability (smoke-tested up front, key facts for Phase B):**
- Reports **PostgreSQL 18.3**. `gen_random_uuid()` is in core — no extension needed.
- **No `pgcrypto`** bundled. This is fine: the **credential vault encrypts in the Node
  app layer** with `CREDENTIAL_MASTER_KEY` (AES-256-GCM via `node:crypto`), so the DB
  only ever stores ciphertext. This matches the existing `generate:key` script and the
  "32 raw bytes, base64" env var, and is stronger than DB-side pgcrypto (a DB dump
  reveals nothing without the app key).
- **RLS is genuinely enforced** under the Supabase-style pattern: `begin; set local
  role authenticated; select set_config('request.jwt.claims', '<json>', true); <query>;
  commit;`. Two gotchas locked in for the Phase B harness: the JWT claim must be set in
  the **same transaction** as the query (an implicit per-statement transaction loses
  it), and the `auth.uid()` shim must be **null-safe** for an empty/unset GUC
  (`nullif(current_setting(...,true),'')::jsonb`) or it throws on empty string.

**Test split:** `pnpm test` = fast unit + non-DB integration (this is the Vercel build
gate, per spec "unit tests"). `pnpm test:db` = PGlite-backed DB tests (heavier), run in
CI and at every gate. `pnpm verify` = the full local gate (`ci:checks` + `test:db`).

---

## Phase B — database layer

Full schema (~28 tables), RLS, and a catalog-generated seed, verified end to end
against PGlite. Gate B met: migrations apply from clean, RLS isolation proven,
price parity proven, the site still builds, and local dev works with no DB.

### Schema & RLS

- **6 migrations** (`supabase/migrations/0001..0006`): foundation (enums, role
  helpers, profiles, site_settings, faqs) → catalog → orders/credentials/messages
  /progress + status-transition map → payments/reviews/loyalty/referrals →
  booster ops → audit/analytics. Every table enables RLS in the migration that
  creates it (proven: a test asserts no public table has `rowsecurity = false`).
- **Role model.** Postgres roles `anon`/`authenticated`/`service_role` (Supabase
  managed; a test-only shim recreates them for PGlite). App role lives in
  `profiles.role`; `public.app_current_role()` (A6) reads it, `is_admin()` and
  `can_access_order()` build on it. All three are **security definer** so policy
  lookups don't recurse.
- **Two RLS bugs the tests caught (would also fail on real Supabase):**
  1. `language sql` function bodies are validated at CREATE time
     (`check_function_bodies`), so tables must be created *before* the functions
     that read them — reordered 0001 and 0003.
  2. Mutual inline subqueries between `orders` and `order_assignments` policies
     caused *infinite recursion*; routed both through the security-definer
     `can_access_order()` helper (which bypasses RLS) instead.
- **Credential vault deny-all (B2).** `order_credentials` has RLS + `force row
  level security`, grants revoked from anon/authenticated, and **no policies** —
  every authenticated actor (including admin) is denied outright; only the service
  role reads it. Decryption is app-layer (AES-256-GCM, `CREDENTIAL_MASTER_KEY`)
  after an explicit ownership/assignment check. Proven by `rls-isolation.test.ts`.
- **Role-escalation guard.** `guard_profile_role` blocks a signed-in
  `authenticated` user from changing any profile's role (server/service/seed
  contexts are trusted). NOT security definer, so `current_user` reflects the real
  caller. Proven by a test.
- **Coupons are not public** (no anon grant) — validated server-side. The public
  catalog (games/ranks/prices/modifiers/regions) is genuinely public and
  anon-readable; catalog reads at runtime use the service role anyway.
- **Fractional columns use `double precision`, not `numeric`** so node-postgres,
  PGlite, and PostgREST all return JS numbers — keeping price parity exact across
  drivers. Integer money stays `int`/`bigint`.

### Seed & data-access cutover

- **`supabase/seed.sql` is GENERATED** from `lib/catalog/*` by `pnpm gen:seed`
  (spec B1) — prices are never re-typed. Idempotent upserts on each table's
  natural key; `pnpm db:seed` is safe to re-run. All pricing marked PLACEHOLDER.
- **`source.ts` is now async** (the deferred Phase A cutover). Source selection:
  Supabase configured → `createSupabaseCatalogSource()` (supabase-js, service-role,
  server-only) wrapped in `withFileFallback`; otherwise the file source. The DB
  backend is **dynamically imported** only when configured, so `server-only` /
  supabase-js never enter a file-mode bundle or the test graph.
- **DB source is split for testability.** `db-source.ts` (no `server-only`) holds
  the shared row→type mappers, context assembly, and the SQL-reader backend used
  by tests. `supabase-source.ts` (`server-only`) holds the runtime supabase-js
  backend, reusing those mappers. So the parity test drives the real schema+seed
  through the same mappers the runtime uses.
- **Price parity (B3) proven.** `price-parity.test.ts` loads the schema + generated
  seed into PGlite, drives the SQL catalog source, and asserts `computeQuote()` is
  byte-identical to the file source across 9 configs (all games/services, duo,
  modifiers, region multipliers, LoL LP + flex, coupon). Server-authoritative
  pricing is unchanged.
- **Order lifecycle scaffolding only (B4).** Status enum + allowed-transition table
  exist; nothing requiring accounts or payments is wired (that's Phase 2).

### Test harness

PGlite (Postgres 18, in-process) with a Supabase shim (`supabase-shim.sql`) +
`bootstrapDb()` (shim → all real migrations via the runner) + an `asActor()` helper
implementing the Supabase pattern (`set local role` + transaction-scoped
`request.jwt.claims`). This is the reusable substrate for all DB tests.

---

## Phase C — de-genericized design system

Owner direction: **bright lily-pond** (light-first). Full details, the two-pass
plan, and the token reference live in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md); the
decisions worth logging here:

- **Substitution.** The spec's `/mnt/skills/public/frontend-design/SKILL.md` is not
  present in this environment; used the available `design:design-system` +
  `artifact-design` skills plus the brainstorm→critique→revise method instead.
- **Escaping the AI default (C1).** Moved off dark + acid-green + cyan to a
  **light** system with a **deep, ownable pond green** (`oklch(0.5 0.132 153)`), a
  **crown gold** secondary pulled from the mascot (no reflexive cyan), and a
  **sage** neutral ramp. Boldness is spent on typography + the signature element,
  not the palette.
- **Tokens, one file (C2).** Everything (named palette → semantic roles → type,
  spacing, radii, elevation, motion) is CSS variables in `app/globals.css`. Verified
  no raw hex remains in components (grep) except the mascot/OG/icon brand artwork,
  which is the intentional single-source SVG.
- **Typography (C3).** Fraunces (display) / Hanken Grotesk (body) / Spline Sans
  Mono (prices) via `next/font` — all SIL OFL, self-hosted, none of them
  Inter/Geist/Roboto. Headings use the display face via a base rule; prices use a
  `.tabular` mono class.
- **Signature (C4).** `components/brand/lily-ladder.tsx` — the ranked climb as
  lily pads with the crowned frog on top and a hover ripple. Placed on the home
  hero and each game hub (replacing the flat, low-contrast tier chips).
- **Buttons.** The "lily-pad press" — controls rest on a colored underside edge
  (`shadow-pad`) and press into the pond on `:active`. Added a `crown` variant;
  removed the old `accent` variant (unused).
- **States (C5).** 404 / error / loading rewritten in the brand's voice ("This pad
  is empty", "Something slipped into the pond") with real direction, not apology.
- **Self-critique (Gate C).** Removed the home "Highlights" 3-card grid — its
  points duplicated the hero stat row and three stacked card-grids was the
  templated rhythm the redesign is trying to escape.
- **Accessibility.** axe (`wcag2a`/`aa`/`21aa`) returns **0 violations** on the
  home page, a money page, and the game hub — this also verifies AA color-contrast.
  Fixed one pre-existing issue: the hero stat row used `<dl>/<dt>/<dd>` with
  invalid nesting → changed to a `<ul>`.
- **Verification note.** Next 16 allows only one `next dev` per directory and
  another session held it, so Phase C was verified against a **production build**
  (`next start` on port 3100) via the preview tools — not a blocker, just a
  different port/mode.
