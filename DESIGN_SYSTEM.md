# RankedFrogs — Design System

The portable, cross-surface contract for how RankedFrogs looks and moves. This
document plus the repo is the single source of truth that travels between Claude
Chat, Code, and Design. Tokens live in [`app/globals.css`](app/globals.css) — one
file re-themes the whole site. No raw hex or magic numbers belong in components.

> **Provenance note.** The build spec asked to read
> `/mnt/skills/public/frontend-design/SKILL.md` before this phase; that file is not
> present in this environment. Substitute: the available `design:design-system`
> and `artifact-design` skills for structure, plus the two-pass
> brainstorm → critique → revise method below.

---

## 1. The plan (pass one — brainstorm)

**Subject, not reference.** No reference image was supplied, so the look is
derived from the subject: the **ranked ladder**, the **pond / lily-pad**, and the
**crowned frog** as "king of the ladder." The owner chose a **bright lily-pond**
mood — light, fresh, approachable — over the dark theme the MVP shipped with.

- **Concept:** each rank is a lily pad; the climb is a hop from pad to pad; the
  crowned frog waits on the top pad. Daylight on a pond: warm paper, deep green
  water, a gold crown.
- **Palette idea:** a deep, ownable **pond green** (primary), a **crown gold**
  pulled straight from the mascot (secondary), a **sage** neutral ramp (never pure
  gray), on **warm paper** with **deep-green ink**.
- **Type idea:** a characterful editorial display + a warm humanist body + a
  precise mono for prices. Explicitly not Inter / Geist / Roboto.
- **Signature idea:** the **lily-pad rank ladder** — a stepped climb of colored
  pads with the crowned frog on top and a ripple on hover. Spend the boldness
  here; keep everything else quiet.

## 2. The critique (pass two — against the AI-default clusters)

The MVP's direction — **near-black background + bright acid-green accent + cyan
secondary + default shadcn component styling** — is one of the three most common
AI-generated looks. Auditing the brainstorm against that:

| Risk | Verdict |
| --- | --- |
| Dark + neon-green (cluster #1) | **Escaped** — light-first, and the green is deep/desaturated, not acid. |
| Reflexive cyan secondary | **Cut** — secondary is a warm **crown gold** rooted in the mascot, not cyan. |
| Big-number hero + full-bleed gradient (template) | **Replaced** — the hero is a thesis ("Every rank is a lily pad") anchored by the signature ladder, with only soft, organic pond-light blooms. |
| Three stacked N-card feature grids | **Reduced** — removed the redundant "Highlights" grid (its points duplicated the hero); the home now reads hero → games → steps. |
| Default flat buttons | **Replaced** — the "lily-pad press": controls rest on a colored underside edge and press into the pond on `:active`. |
| Generic system fonts | **Replaced** — Fraunces / Hanken Grotesk / Spline Sans Mono. |

## 3. The revision (what shipped)

- Boldness is spent on **typography** and the **signature ladder**, not the
  palette — the palette is specific and calm.
- The green was **deepened** to `oklch(0.5 0.132 153)` so white text on it passes
  AA (it is structure/fill, never body copy).
- The crown gold is decorative/marker only; a darker `--crown-ink` is used when
  gold must be legible as text/icon on paper.
- Dark mode is kept as a supported "pond at night," but light is primary.

## 4. Divergence from the AI default (spec C1)

This design is **light-first**, and where it keeps green it makes it **specific**:

1. **Light, warm paper** (`oklch(0.985 0.008 135)`) with **deep-green ink**, not
   near-black on white or white on near-black.
2. **A deep, ownable pond green** — desaturated and dark enough to carry white
   text, the opposite of default acid/lime `#00ff88`-style green.
3. **No cyan.** The secondary is a **warm crown gold** taken from the mascot —
   green + gold (lily pad + crown), a pairing rooted in the subject.
4. **A sage-tinted neutral ramp** — every "gray" carries a little green, so the
   whole surface feels like one material, not stock Tailwind slate.
5. **Editorial type** (a soft serif display) instead of a techy grotesque —
   trustworthy-charming, not another dashboard.
6. **A subject-born signature** (the lily-pad ladder) rather than a decorative
   gradient. The one memorable thing is _about boosting_, not about CSS.

## 5. Token reference (spec C2)

All tokens are CSS variables in `app/globals.css`. Components reference semantic
**roles** (e.g. `bg-primary`, `text-muted-foreground`), which map to the named
palette — so re-theming touches only the named layer.

### Named palette (the 5 ownable colors)

| Token | Value | Role |
| --- | --- | --- |
| `--pond` | `oklch(0.5 0.132 153)` | Primary — deep lily-pad green (AA with white text) |
| `--pond-deep` | `oklch(0.42 0.12 156)` | Pressed / pad-underside edge |
| `--crown` | `oklch(0.8 0.132 82)` | Secondary accent — gold (from the mascot) |
| `--crown-ink` | `oklch(0.46 0.1 74)` | Legible gold for text/icons on paper |
| `--deep-water` | `oklch(0.26 0.035 172)` | Pond depth — footer, dark mode base |

### Sage neutral ramp

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `oklch(0.985 0.008 135)` | App background |
| `--paper-sunk` | `oklch(0.965 0.01 140)` | Recessed wells / muted bg |
| `--surface` | `oklch(1 0 0)` | Cards (float above paper) |
| `--ink` | `oklch(0.24 0.022 168)` | Primary text |
| `--ink-soft` | `oklch(0.44 0.02 165)` | Secondary text (AA on paper) |
| `--sage-line` | `oklch(0.9 0.012 150)` | Hairline borders |
| `--sage-line-strong` | `oklch(0.85 0.014 150)` | Input borders |
| `--sage-fill` | `oklch(0.95 0.012 150)` | Chips, ghost hovers, secondary surfaces |

### Semantic roles (what components use)

`--background --foreground --card --card-foreground --popover --primary
--primary-foreground --secondary --secondary-foreground --muted
--muted-foreground --accent --accent-foreground --success --warning
--destructive --destructive-foreground --border --input --ring`

Plus rank-tier accents `--rank-{iron,bronze,silver,gold,platinum,emerald,diamond,
master,grandmaster,celestial}` (mid-tone, used by the lily-pad ladder) and chart
tokens `--chart-1..5`.

**Contrast:** AA verified — an axe run (`wcag2a`/`wcag2aa`/`wcag21aa`, which
includes color-contrast) reports **0 violations** on the home page, a money page
(`/league-of-legends/rank-boost`), and the game hub. Green is accent/structure,
never body copy.

### Typography (spec C3)

| Role | Family | Token | Why |
| --- | --- | --- | --- |
| Display (h1–h3) | **Fraunces** | `--font-display` | A soft "old-style" serif with optical sizing and a little wonk — warm, editorial, confident. Not a techy grotesque; not Inter/Geist/Roboto. |
| Body / UI | **Hanken Grotesk** | `--font-sans` | A humanist grotesque — friendly and highly legible, distinct from the ubiquitous Inter. |
| Data / prices | **Spline Sans Mono** | `--font-mono` (`.tabular`) | Tabular figures for money; a precise, modern mono that reads as "data," not code. |

All three are SIL OFL and self-hosted by `next/font` (no runtime external
request). Headings set `letter-spacing: -0.015em` and use optical sizing; prices
use `.tabular` (mono + `tabular-nums`). The type scale uses Tailwind's `text-*`
steps (a tokenized scale); no arbitrary font sizes in components.

### Spacing, radii, elevation

- **Spacing:** Tailwind's spacing scale (`--spacing` base, `0.25rem`). No raw px
  in components — offsets are expressed as `calc(var(--spacing) * n)`.
- **Radii:** `--radius: 0.75rem`, with `--radius-{sm,md,lg,xl}` derived.
- **Elevation:** `--elevation-{sm,md,lg}` (soft, ink-tinted) → `shadow-{sm,md,lg}`;
  `--elevation-pad` → `shadow-pad`, the green pad-underside edge for buttons.

### Motion tokens (spec D1 — full slot registry in §6, added in Phase D)

| Token | Value |
| --- | --- |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` |
| `--ease-ripple` | `cubic-bezier(0.22, 0.61, 0.36, 1)` |
| `--duration-fast` | `130ms` |
| `--duration-base` | `220ms` |
| `--duration-slow` | `360ms` |
| `--duration-slower` | `620ms` |
| `--travel-xs / -sm / -md` | `2px / 6px / 12px` |

Keyframes defined in `globals.css`: `pond-ripple`, `lily-rise`, `crown-bob`.
Reduced motion is honored globally (all animation/transition durations collapse
under `prefers-reduced-motion: reduce`).

## 6. Signature element (spec C4)

The **lily-pad rank ladder** ([`components/brand/lily-ladder.tsx`](components/brand/lily-ladder.tsx)):
a stepped climb of colored pads (tier hue passed as a `--rank-*` token, never a
raw color), each resting on a colored edge, with the crowned frog on the top pad
and a **pond ripple** on hover. Pure CSS interaction; the ripple and the crown-bob
are disabled under reduced motion. Used on the home hero (a generic climb) and
each game hub (that game's tiers). This is where the design spends its boldness;
everything around it stays quiet.

## 7. Motion slot registry (spec D2/D4)

Every animatable spot has a stable ID in [`lib/motion.ts`](lib/motion.ts) — the
single swap-point. Default motion ships now (restrained: one signature moment at
the hero/ladder, quiet elsewhere) and every slot has a reduced-motion fallback.
Motion tokens are in §5. The paste-ready per-slot brief for Claude Design is
[CLAUDE_DESIGN_BRIEF.md](CLAUDE_DESIGN_BRIEF.md).

| Slot ID | Intent | Default impl (swap point) | Reduced-motion |
| --- | --- | --- | --- |
| `hero.enter` | Hero + ladder rise in on load | `.motion-hero-enter` (globals.css) | End state, no travel |
| `hero.mascot-idle` | Crowned frog bobs on the top pad | `crown-bob` in `lily-ladder.tsx` | No bob (`motion-safe`) |
| `section.reveal` | Sections rise as they scroll in | `.motion-reveal` (scroll-timeline) | Off, static |
| `calculator.line-enter` | New price line rises in | `.motion-line-enter` (keyed) | End state |
| `calculator.line-update` | Changed line highlights | _stub_ (reserved) | n/a yet |
| `calculator.total-change` | Total pops on recalc | `.motion-total-pop` (keyed by total) | No scale; still announced |
| `rankLadder.tier-hover` | Pad lifts + ripples on hover | `pond-ripple` in `lily-ladder.tsx` | No lift/ripple |
| `button.press` | Control presses into the pond | `active:` classes in `button.tsx` | Instant press |
| `nav.transition` | Nav link color easing | `transition-colors` in `site-header.tsx` | Instant |
| `loading.skeleton` | Calm pulse while loading | `animate-pulse` in `loading.tsx` | No pulse |
| `order.status-change` | Status badge advances | _stub_ (Phase 2 surface) | n/a yet |

To replace a slot with Claude Design output: paste the returned CSS `@keyframes`
(named to the slot) or framer-motion `Variants` and wire it in the one place named
above, behind the reduced-motion guard. See CLAUDE_DESIGN_BRIEF.md for the exact
request format per slot.
