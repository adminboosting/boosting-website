# Disabled GitHub Actions workflows

These CI workflows live here (not in `.github/workflows/`) because the GitHub
login used to push this repo lacks the `workflow` OAuth scope, which GitHub
_requires_ to create or update files under `.github/workflows/`. Keeping them here
lets the repo push cleanly without losing the CI definitions.

## To activate GitHub Actions CI (one-time)

1. Grant the scope once, in a terminal:
   ```bash
   gh auth refresh -h github.com -s workflow
   ```
   (approve in the browser) — or create a Personal Access Token with the
   `workflow` scope and use it for git.
2. Move these files up one level:
   ```bash
   mkdir -p .github/workflows
   git mv .github/workflows-disabled/ci.yml .github/workflows/ci.yml
   git mv .github/workflows-disabled/supabase-keepalive.yml .github/workflows/supabase-keepalive.yml
   git commit -m "chore: enable GitHub Actions CI"
   git push
   ```

Until then, **Vercel's build runs on every push** and is the effective gate; the
full test suite is run locally at each phase gate.

## What's here

- `ci.yml` — install, lint, typecheck, test, build, and the client-secret leak guard
- `supabase-keepalive.yml` — daily ping so the free Supabase project doesn't pause
