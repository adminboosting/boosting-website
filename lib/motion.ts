/**
 * Animation slot registry (spec D2/D3).
 *
 * Every animatable spot on the site has a STABLE ID here, with its location,
 * intent, target, default-motion implementation, and reduced-motion fallback.
 * Components apply the class strings in `motion` below (or the interaction lives
 * in the named component) — so a slot's motion can be swapped in exactly ONE
 * place with Claude Design output, without touching surrounding code.
 *
 * Default motion ships now (the site feels intentional before any Claude Design
 * work) and is restrained per the owner default: one orchestrated signature
 * moment (the hero + ladder), quiet everywhere else. Reduced motion is honored
 * globally — see app/globals.css. Motion tokens live in globals.css too.
 *
 * The paste-ready per-slot brief for Claude Design is CLAUDE_DESIGN_BRIEF.md.
 */

export type MotionSlotKind = "css-class" | "component-interaction" | "stub";

export interface MotionSlot {
  id: string;
  location: string;
  intent: string;
  target: string;
  kind: MotionSlotKind;
  /** The single swap-point: a globals.css class, or the component that owns it. */
  impl: string;
  reducedMotion: string;
}

export const MOTION_SLOTS: MotionSlot[] = [
  {
    id: "hero.enter",
    location: "app/(marketing)/page.tsx — hero",
    intent: "The hero content and the signature ladder rise into place on load.",
    target: "Hero left column + ladder card",
    kind: "css-class",
    impl: ".motion-hero-enter (globals.css) → keyframe lily-rise",
    reducedMotion: "Collapses to end state (visible, no travel) via the global rule.",
  },
  {
    id: "hero.mascot-idle",
    location: "components/brand/lily-ladder.tsx — top rung crown",
    intent: "The crowned frog gently bobs, alive but calm, on the top pad.",
    target: "FrogMascot on the top rung",
    kind: "component-interaction",
    impl: "motion-safe:animate-[crown-bob …] in lily-ladder.tsx → keyframe crown-bob",
    reducedMotion: "motion-safe gate + global rule: no bob.",
  },
  {
    id: "section.reveal",
    location: "app/(marketing)/page.tsx — Launch games, How it works",
    intent: "Sections rise a few pixels as they scroll into view. Quiet.",
    target: "Marketing <section> blocks",
    kind: "css-class",
    impl: ".motion-reveal (globals.css) → scroll-driven lily-rise via animation-timeline: view()",
    reducedMotion: "Gated behind prefers-reduced-motion: no-preference — off, content static.",
  },
  {
    id: "calculator.line-enter",
    location: "components/calculator/calculator.tsx — itemized lines",
    intent: "Each new price line rises in as the configuration changes.",
    target: "Each <div> row inside the lines <dl>",
    kind: "css-class",
    impl: ".motion-line-enter (globals.css) → keyframe lily-rise; keyed by line so it replays",
    reducedMotion: "Collapses to end state via the global rule.",
  },
  {
    id: "calculator.line-update",
    location: "components/calculator/calculator.tsx — itemized lines",
    intent: "A line whose amount changed briefly highlights (not just re-enters).",
    target: "A line row whose amountCents changed",
    kind: "stub",
    impl: "Not yet wired — reserved. Default today is line-enter's replay.",
    reducedMotion: "Must define a no-op fallback when implemented.",
  },
  {
    id: "calculator.total-change",
    location: "components/calculator/calculator.tsx — total",
    intent: "The total gives a small confident pop when it recalculates.",
    target: "The total <span> (aria-live)",
    kind: "css-class",
    impl: ".motion-total-pop (globals.css) → keyframe total-pop; keyed by totalCents",
    reducedMotion: "Collapses to no scale via the global rule; aria-live still announces.",
  },
  {
    id: "rankLadder.tier-hover",
    location: "components/brand/lily-ladder.tsx — each pad",
    intent: "Hovering a pad lifts it and sends a ripple across the pond.",
    target: "Each lily pad + its bud",
    kind: "component-interaction",
    impl: "group-hover translate + group-hover:animate-[pond-ripple …] → keyframe pond-ripple",
    reducedMotion: "Global rule collapses the ripple/lift.",
  },
  {
    id: "button.press",
    location: "components/ui/button.tsx",
    intent: "Controls rest on a colored underside edge and press into the pond.",
    target: "All buttons / button-styled links",
    kind: "component-interaction",
    impl: "shadow-pad + active:translate-y-0.5 active:shadow-none in button.tsx",
    reducedMotion: "Transition duration collapses; press still registers instantly.",
  },
  {
    id: "nav.transition",
    location: "components/site/site-header.tsx",
    intent: "Nav links ease between resting and hovered color.",
    target: "Header nav links",
    kind: "component-interaction",
    impl: "transition-colors hover:text-foreground in site-header.tsx",
    reducedMotion: "Transition collapses to instant.",
  },
  {
    id: "loading.skeleton",
    location: "app/loading.tsx",
    intent: "A calm pulse while a route loads.",
    target: "Skeleton blocks",
    kind: "css-class",
    impl: "animate-pulse (Tailwind) with staggered animation-delay from --duration-fast",
    reducedMotion: "Global rule collapses the pulse.",
  },
  {
    id: "order.status-change",
    location: "Phase 2 order surfaces (not built yet)",
    intent: "An order's status badge transitions when it advances.",
    target: "Order status badge (future)",
    kind: "stub",
    impl: "Reserved — no surface exists yet. Wire when Phase 2 lands.",
    reducedMotion: "Must define a no-op fallback when implemented.",
  },
];

/**
 * The swappable class handles components apply. Editing one entry here (and its
 * class in globals.css) re-skins that slot everywhere it's used.
 */
export const motion = {
  heroEnter: "motion-hero-enter",
  sectionReveal: "motion-reveal",
  calculatorLineEnter: "motion-line-enter",
  calculatorTotalChange: "motion-total-pop",
  loadingSkeleton: "animate-pulse",
} as const;
