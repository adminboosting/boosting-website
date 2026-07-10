# RankedFrogs — Claude Design Brief (animation slots)

This is the paste-ready brief for generating motion with **Claude Design**. Each
slot below is self-contained: paste one slot's block into Claude Design and ask
for the requested output. Then hand the result back to Claude Code with
**"implement slot [ID] with this,"** and Code will wire it into the one place named
in [DESIGN_SYSTEM.md §7](DESIGN_SYSTEM.md) behind the reduced-motion guard and
verify it.

---

## Brand + motion principles (applies to every slot)

- **Mood:** bright lily-pond — calm, confident, a little witty. Motion should feel
  like ripples and hops on water, never bouncy or techy.
- **Restraint:** one orchestrated signature moment (the hero + the lily-pad
  ladder); everything else is quiet. Prefer small travel and soft easing.
- **Reduced motion is mandatory.** Every slot MUST define a reduced-motion variant
  that is either nothing or an instant end-state. Never rely on motion to convey
  information.
- **No layout dependencies.** Animate `transform` and `opacity` only. Do not
  animate `width`/`height`/`top`/`left` or anything that reflows, and do not
  assume any element exists that the target description doesn't name.
- **Tokens only.** Use the motion tokens below by name; do not invent durations or
  easings. Keep total duration ≤ the stated max per slot.

### Motion tokens available (from `app/globals.css`)

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

Brand colors you may reference (for glows/ripples): `--pond` `oklch(0.5 0.132 153)`,
`--crown` `oklch(0.8 0.132 82)`. Existing keyframes you can reuse or replace:
`lily-rise`, `pond-ripple`, `crown-bob`, `total-pop`.

### Two output formats (pick per slot's request)

- **CSS `@keyframes`** — return a `@keyframes <slot-name>` block plus the one-line
  `animation:` shorthand using the tokens. Name it to the slot (e.g.
  `@keyframes hero-enter`). Use this for load/scroll/state animations.
- **framer-motion `Variants`** — return a typed `Variants` object plus the
  `transition` (durations/eases as numbers/arrays matching the tokens). Use this
  only if the slot needs orchestration/stagger that CSS can't express. (Adding
  framer-motion is a dependency decision Code will confirm first.)

---

## Slots

### `hero.enter`
- **Intent:** the hero copy and the signature ladder settle up into place on first load.
- **Tokens:** `--duration-slow`, `--ease-out`, `--travel-md`.
- **Constraints:** max 360ms; transform/opacity only; reduced-motion → visible, no travel; may stagger the two columns by ≤ `--duration-fast`.
- **Requested output:** CSS `@keyframes hero-enter` + `animation:` shorthand (or a framer `Variants` with a 2-child stagger if you want the copy and ladder offset).

### `hero.mascot-idle`
- **Intent:** the crowned frog on the top pad breathes/bobs gently, alive but calm.
- **Tokens:** `--ease-in-out`; period ~3s.
- **Constraints:** infinite loop, ≤ `--travel-xs` travel; transform only; reduced-motion → no animation. Must not shift layout (the crown is absolutely positioned).
- **Requested output:** CSS `@keyframes mascot-idle` + shorthand.

### `section.reveal`
- **Intent:** marketing sections rise a few pixels as they scroll into view.
- **Tokens:** `--travel-sm`, linear (scroll-driven).
- **Constraints:** scroll-timeline (`animation-timeline: view()`); reduced-motion AND unsupported browsers → static/visible; transform/opacity only. Range roughly `entry 5%` → `cover 18%`.
- **Requested output:** CSS `@keyframes section-reveal` + the `animation` + `animation-timeline`/`animation-range` declarations.

### `calculator.line-enter`
- **Intent:** each itemized price line rises in as the configuration changes.
- **Tokens:** `--duration-base`, `--ease-out`, `--travel-sm`.
- **Constraints:** max 220ms; the row is re-keyed on change so the animation replays; transform/opacity only; reduced-motion → end state.
- **Requested output:** CSS `@keyframes line-enter` + shorthand.

### `calculator.line-update`  _(stub — implement when requested)_
- **Intent:** a line whose amount changed briefly highlights (distinct from a fresh line entering).
- **Tokens:** `--duration-base`, `--ease-standard`; may tint with `--pond` or `--crown` at low alpha.
- **Constraints:** max 260ms; background/opacity/transform only (no reflow); reduced-motion → no highlight. Must not depend on knowing the previous value in the DOM — assume a class is toggled on the changed row.
- **Requested output:** CSS `@keyframes line-update` + shorthand.

### `calculator.total-change`
- **Intent:** the total gives a small, confident pop when it recalculates.
- **Tokens:** `--duration-base`, `--ease-standard`.
- **Constraints:** max 220ms; scale ≤ 1.07, `transform-origin: right center`; the element is re-keyed on total change; reduced-motion → no scale (the `aria-live` region still announces the new value).
- **Requested output:** CSS `@keyframes total-change` + shorthand.

### `rankLadder.tier-hover`
- **Intent:** hovering a lily pad lifts it slightly and sends a ripple across the pond from its bud.
- **Tokens:** `--duration-slower` (ripple), `--ease-ripple`, `--travel-xs` (lift); ripple color = the rung's `--rung-hue`.
- **Constraints:** pure CSS (`group-hover`); transform/opacity/scale only; ripple is a separate absolutely-positioned element already present; reduced-motion → no lift/ripple.
- **Requested output:** CSS `@keyframes tier-hover-ripple` + the `group-hover` `animation`/`transform` declarations.

### `button.press`
- **Intent:** a control rests on a colored underside edge and presses into the pond on active.
- **Tokens:** `--duration-fast`, `--ease-standard`, uses `--shadow-pad` at rest.
- **Constraints:** ≤ 130ms; `translateY` ≤ `--travel-xs` and drop the edge shadow on `:active`; reduced-motion → instant. Applies to the shared button — keep it subtle enough for dozens on a page.
- **Requested output:** the `:active` transform + shadow declarations (CSS), matched to the resting `shadow-pad`.

### `nav.transition`
- **Intent:** header nav links ease between resting and hovered color.
- **Tokens:** `--duration-fast`, `--ease-standard`.
- **Constraints:** color only; reduced-motion → instant.
- **Requested output:** the `transition` declaration (CSS).

### `loading.skeleton`
- **Intent:** a calm pulse while a route loads, pads settling in.
- **Tokens:** `--duration-slower` (pulse period), stagger by `--duration-fast`.
- **Constraints:** opacity/background only; reduced-motion → no pulse (static blocks).
- **Requested output:** CSS `@keyframes skeleton-pulse` + shorthand, plus the per-item `animation-delay` scheme.

### `order.status-change`  _(stub — Phase 2 surface, no element yet)_
- **Intent:** an order's status badge transitions when the order advances a stage.
- **Tokens:** `--duration-base`, `--ease-out`; may use `--pond`/`--crown`.
- **Constraints:** max 260ms; transform/opacity/color only; reduced-motion → instant swap. Assume only a status badge element with a data attribute for the new status; do not assume surrounding layout.
- **Requested output:** CSS `@keyframes status-change` + shorthand (or a framer `Variants` keyed by status if orchestration is wanted).

---

## How to hand back

1. In Claude Design, paste one slot block above and ask for the requested output.
2. Copy the returned CSS `@keyframes` (or framer `Variants`) and paste it to Claude
   **Code** with: **"implement slot `[ID]` with this."**
3. Code wires it into the single swap-point named in DESIGN_SYSTEM.md §7, keeps the
   reduced-motion guard, runs the build + a quick preview check, and reports back.

Do the slots one at a time or in a batch — each is independent. Nothing here
changes prices, data, or layout; motion is purely additive and always degrades to
a still, legible page.
