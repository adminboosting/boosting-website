# RUNBOOK — operating RankedFrogs

This is your **non-technical operator's manual**. It lists every manual action
you (the owner) need to take — creating accounts, getting keys, pasting them into
dashboards — so you can run the site without reading code. Everything here uses
**free** services.

> **Where you are now (Phase 4 — feature-complete):** the site has the public
> calculator, sign-in, checkout → orders, the credential vault, order chat, the
> booster + admin desks, real customer reviews with a moderation queue
> (**/admin/reviews**), loyalty cashback + credit ledger on the account page,
> and the $5 referral program. Steps 1–7 put it live; the remaining manual work
> is the **Pre-launch checklist** at the bottom of this file.

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

### 🟡 Realtime chat (Phase 3) — one check after migrating

Order chat updates live through Supabase **Realtime**. The migrations turn it on
(file `0007_realtime_reviews.sql`), but hosted Supabase is the only place it can
actually take effect — so after you run Step 5 (`pnpm db:migrate`) against your
live project, verify it once:

1. In the Supabase dashboard open **Database → Publications** and click
   **`supabase_realtime`**. The table list must include **`order_messages`** and
   **`order_progress`**. If either is missing, re-run `pnpm db:migrate`, or just
   flip those two tables on right there in the dashboard.
2. **Eyeball a live message:** open the same order's page in two browser windows
   (for example: your admin view of the order in one, the customer view in the
   other — or one normal and one private window signed into two accounts). Send
   a chat message in one window. It should appear in the other **within a
   second or two, without refreshing**.

If a message only shows up after a refresh or ~15 seconds, the site is quietly
using its built-in fallback (it re-checks for messages every 15 seconds), and
the page shows a small "Live updates unavailable" note. Nothing is broken or
lost — chat still works — but go back to check 1, because Realtime isn't on.

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

## 🟡 (anytime) Polishing the animations with Claude Design

The site already animates on its own — nothing is required here. But when you want
to refine a specific animation, there's a simple loop:

1. Open **[CLAUDE_DESIGN_BRIEF.md](CLAUDE_DESIGN_BRIEF.md)**. It lists every
   animated spot ("slot") on the site — the hero, the lily-pad ladder, the price
   total, buttons, and so on.
2. Copy **one slot's block** and paste it into **Claude Design**, then ask for the
   animation it requests.
3. Copy what Claude Design gives back and paste it to **Claude Code** with:
   **"implement slot `[the slot ID]` with this."**
4. Claude Code wires it in (keeping the reduced-motion safety), rebuilds, and shows
   you the result. Do one slot at a time or several — each is independent, and none
   of this can change prices or break the page.

`DESIGN_SYSTEM.md` and `CLAUDE_DESIGN_BRIEF.md` are the shared "design contract"
that travels between Claude Chat, Code, and Design — you don't need to read them,
but they're what keeps the look consistent as things get polished.

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
- [ ] The footer prints "Pricing shown is placeholder and subject to change" —
      it does **not** disappear on its own. Once final prices are set, decide
      deliberately: remove the line, or keep it while prices are still settling.
- [ ] Replace the three placeholder legal pages (`/legal/terms`, `/legal/privacy`,
      `/legal/refund-policy`) with real, lawyer-reviewed copy. Their page
      descriptions currently self-describe as drafts, so leaving them as-is
      advertises "placeholder" to search engines and customers alike.
- [ ] Publish your first reviews. Customers can submit a review from a completed
      order, but **nothing shows publicly until you approve it** in
      **/admin/reviews** (each pending review shows automatic content flags —
      links, contact info, shouting — to help you decide). Until at least one is
      published, `/reviews` shows clearly-labeled sample reviews.
- [ ] Confirm the security headers are live on the real domain:
      ```bash
      curl -sI https://rankedfrogs.com | grep -i content-security
      ```
      should print a `content-security-policy:` line that mentions your Supabase
      project URL (both `https://…supabase.co` and `wss://…supabase.co`). Then
      open an order chat in a real browser and confirm live messages still
      arrive instantly — the CSP is the one thing that could silently break
      chat, and the browser console would show "Content Security Policy" errors
      if it did.
- [ ] Know the referral numbers: a referrer earns a **$5 store credit** when the
      person they referred gets their **first** payment confirmed (one reward
      per referred customer; self-referrals are ignored automatically). To void
      an abusive referral (e.g. one person signing up twice), open Supabase
      **SQL Editor** and run
      `update referrals set status = 'void' where id = '<row id from the referrals table>';`
      — a voided row is never rewarded. There is deliberately no admin UI for
      this yet.
- [ ] Reminder: the five AI features stay **off** (their free, deterministic
      fallbacks run instead) until you add `ANTHROPIC_API_KEY` **and** set
      `AI_FEATURES_ENABLED=true`. Leaving them off costs nothing and everything
      still works — see "Turning AI on" above.
- [ ] Verify a sending domain in Resend and update `EMAIL_FROM`.
- [ ] Switch payments out of sandbox/test only when you're truly ready to take money.
