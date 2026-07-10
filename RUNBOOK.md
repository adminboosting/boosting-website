# RUNBOOK — operating RankedFrogs

This is your **non-technical operator's manual**. It lists every manual action
you (the owner) need to take — creating accounts, getting keys, pasting them into
dashboards — so you can run the site without reading code. Everything here uses
**free** services.

> **Where you are now (Phase 0):** the app is a deployable placeholder home page.
> You can put it live on the internet today (Steps 1–3). The database, calculator,
> payments, etc. arrive in later phases; their setup steps are marked
> **(needed from Phase N)** so you can do them when they matter.

Legend: 🟢 = do this now · 🟡 = do this when the phase arrives · 🔒 = a secret,
never share or commit it.

---

## Accounts you'll need (all have free tiers)

| Service | Used for | When |
| --- | --- | --- |
| **GitHub** | Stores the code; triggers deploys | 🟢 now |
| **Vercel** | Hosts the website | 🟢 now |
| **Supabase** | Database, login, file storage | 🟡 Phase 1 |
| **NOWPayments** | Crypto payments (sandbox first) | 🟡 Phase 2 |
| **Stripe** (test mode) | Card payments for demos only | 🟡 Phase 2 |
| **Resend** | Sending emails | 🟡 Phase 2 |
| **Sentry** (optional) | Error alerts | 🟡 anytime |
| **Anthropic** (optional) | Turning on AI features | 🟡 much later |

---

## Step 1 — 🟢 Get the code on GitHub

The repo already has a GitHub remote (`origin`). If you're starting fresh:
create a new **private** repo on github.com and push this folder to it. Once the
code is on GitHub's `main` branch, Vercel can deploy it.

## Step 2 — 🟢 Connect Vercel (free hosting)

1. Go to **vercel.com** and sign up with your GitHub account.
2. Click **Add New… → Project**, then **Import** the RankedFrogs repository.
3. Vercel auto-detects Next.js. Leave the defaults. Click **Deploy**.
4. In ~1 minute you'll get a live URL like `https://rankedfrogs-xxxx.vercel.app`.

That's it — the placeholder site is live. Every time code is pushed to `main`,
Vercel redeploys automatically.

## Step 3 — 🟢 Set the site URL

In the Vercel project: **Settings → Environment Variables**, add:

- `NEXT_PUBLIC_SITE_URL` = your site URL (e.g. `https://rankedfrogs-xxxx.vercel.app`
  at first, then `https://rankedfrogs.com` once the domain is connected)

**Connecting rankedfrogs.com:** in Vercel → **Settings → Domains**, add
`rankedfrogs.com` (and `www.rankedfrogs.com`), then follow Vercel's instructions to
point your domain registrar's DNS at Vercel (usually an A record and/or a CNAME).
Once it's live, set `NEXT_PUBLIC_SITE_URL=https://rankedfrogs.com` and redeploy
(Vercel → Deployments → ⋯ → Redeploy) so canonical URLs, the sitemap, and social
share links all use the real domain.

---

## Step 4 — 🟡 (from Phase 1) Create the free Supabase project

1. Go to **supabase.com**, sign up, and **New project**. Pick a strong database
   password and save it somewhere safe. Choose the region closest to your players.
2. Wait for it to finish provisioning (~2 min).
3. Open **Project Settings → API**. You'll copy three values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key 🔒 → `SUPABASE_SERVICE_ROLE_KEY` *(secret! server-only)*
4. Open **Project Settings → Database → Connection string (URI)** and copy it →
   `SUPABASE_DB_URL` 🔒 (used only for running migrations).

Paste all four into Vercel's **Environment Variables** (Step 3 location), then
redeploy.

> **Keep it awake:** free Supabase projects pause after ~1 week idle during
> development. This repo includes a GitHub Action (`supabase-keepalive`) that
> pings it daily — see Step 7 to enable it.

## Step 5 — 🟡 (from Phase 1) Apply the database schema

The database structure and starter data live as SQL files in `supabase/migrations/`
and `supabase/seed.sql`. Two easy ways to apply them (no coding):

**Option A — the project's migration runner (recommended, repeatable):**
This project ships its own runner (no Supabase CLI needed — that installer is
unreliable on this machine). It applies the migrations **in order**, remembers which
ones it already ran, and is safe to re-run.
```bash
# One time: put your Supabase connection string (Step 4, SUPABASE_DB_URL 🔒)
#           into .env.local, then:
pnpm db:migrate   # applies every supabase/migrations/*.sql in order (forward-only)
pnpm db:seed      # loads the starter catalog/prices (idempotent — safe to re-run)
```
Both commands print what they did. `db:migrate` records applied files in a
`_schema_migrations` table, so re-running only applies anything new.

**Option B — Supabase dashboard (no installs):**
1. In Supabase, open **SQL Editor → New query**.
2. Open each file in `supabase/migrations/` **in order** (they're numbered), paste
   its contents, and click **Run**. Then do the same with `supabase/seed.sql`.

> Prefer Option A whenever you can run a terminal command (or ask Claude to) — it's
> repeatable and can't apply migrations in the wrong order.

## Step 6 — 🟡 (from Phase 2) Generate the credential encryption key

Piloted orders store game logins **encrypted**. You need one secret master key.
Have your developer run:
```bash
pnpm generate:key
```
Copy the printed value into Vercel as `CREDENTIAL_MASTER_KEY` 🔒. **Never lose or
change it** once real credentials exist, or those credentials become unreadable.

## Step 7 — 🟡 (from Phase 1) Turn on the Supabase keep-alive

In your GitHub repo: **Settings → Secrets and variables → Actions → New repository
secret**, add:

- `NEXT_PUBLIC_SUPABASE_URL` = your Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key

The daily keep-alive workflow will then ping Supabase so it never pauses. (You can
also add `SUPABASE_SERVICE_ROLE_KEY`, `CREDENTIAL_MASTER_KEY`, `ANTHROPIC_API_KEY`
here later so the CI secret-leak check runs against real values.)

---

## Later phases — quick reference (set up when we get there)

### 🟡 Payments (Phase 2)
- `PAYMENTS_PROVIDERS` — comma list of enabled providers, e.g. `nowpayments,stripe_test,manual`.
- **NOWPayments** (crypto): create an account, get `NOWPAYMENTS_API_KEY` 🔒 and an
  IPN secret `NOWPAYMENTS_IPN_SECRET` 🔒. Keep `NOWPAYMENTS_SANDBOX=true` while testing.
- **Stripe TEST mode only**: use `sk_test_…`/`pk_test_…` keys. Never a live key.
- Crypto refunds are **manual/off-platform** — the admin records them; you send the
  refund from your wallet.

### 🟡 Email (Phase 2)
- `RESEND_API_KEY` 🔒 from resend.com. Until you verify a domain, leave
  `EMAIL_FROM` as `RankedFrogs <onboarding@resend.dev>`. To use your own domain,
  verify it in Resend (add the DNS records they give you) and update `EMAIL_FROM`.

### 🟡 Admin account (Phase 2)
- Set `ADMIN_BOOTSTRAP_EMAIL` to the email you'll register with. The first person
  to sign up with that email becomes the admin automatically.

### 🟡 Cron jobs (Phase 2+)
- Set `CRON_SECRET` 🔒 to any long random string in Vercel. Configure **Vercel Cron**
  to call `/api/cron/purge-credentials` daily with an `Authorization: Bearer <CRON_SECRET>`
  header. (The pricing-insights cron is only needed once AI is enabled.)

### 🟡 Sentry error alerts (optional, anytime)
- Create a free Sentry project, copy the DSN into `NEXT_PUBLIC_SENTRY_DSN`. That's
  enough for error capture. Source-map upload (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
  `SENTRY_PROJECT`) is optional and only used during builds.

### 🟡 Turning AI on (optional, much later — costs money)
1. Add `ANTHROPIC_API_KEY` 🔒 in Vercel.
2. Set `AI_FEATURES_ENABLED=true`.
3. Redeploy. That's the whole switch — no code changes. Leaving the key unset keeps
   all AI features dormant with their non-AI fallbacks (the free default).

---

## Routine operations & troubleshooting

- **Deploy new changes:** just push to `main` — Vercel redeploys automatically.
- **A build failed on Vercel:** open the failed deployment's **Build Logs**. The CI
  in GitHub Actions runs the same checks (`lint`, `typecheck`, `test`, `build`) and
  usually catches issues before they reach Vercel.
- **Environment variable changed but site didn't update:** you must **redeploy**
  after changing env vars in Vercel.
- **Secrets hygiene:** anything marked 🔒 goes only into Vercel/GitHub secret fields
  or your local `.env.local` — never into the code or a chat. `.env.local` is
  git-ignored.

## Pre-launch checklist (the admin panel will remind you)

- [ ] Review and set final prices, then flip `site_settings.pricing_reviewed` to true.
- [ ] Have the placeholder legal pages (`/legal/*`) reviewed by a lawyer.
- [ ] Verify a sending domain in Resend and update `EMAIL_FROM`.
- [ ] Switch payments out of sandbox/test only when you're truly ready to take money.
