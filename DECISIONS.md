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
