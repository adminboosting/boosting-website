"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FrogMascot } from "@/components/brand/frog-mascot";

/**
 * "The Climb" ladder — a diagonal rank ladder (low-left → high-right). On first
 * mount the crowned frog climbs it one tier at a time (a slow, choreographed
 * intro that also drives side-content reveals via `onStep`), then rests at the
 * base. Hovering a tier makes the frog LEAP there and reveal a "from $X" hint;
 * the frog STAYS on the last-hovered tier (it does not snap back), so sweeping
 * across tiers reads as a calm series of leaps.
 *
 * Motion is transform + opacity only; glows animate the opacity of a pre-set
 * box-shadow; frog positions are measured in JS (ResizeObserver, no scroll
 * listeners). Under prefers-reduced-motion the climb/leaps are skipped (frog
 * rests at the base) but the highlight + hint still work. The `.rf-climb*`
 * styles live in app/globals.css.
 */
export interface LilyRung {
  label: string;
  /** A rank-tier CSS variable, e.g. "var(--rank-gold)". */
  colorVar?: string;
  tier?: string;
  /** Formatted "from" price (e.g. "$18.00"); omit/null for custom-quote tiers. */
  price?: string | null;
}

const KNOWN_TIERS = [
  "iron",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "emerald",
  "ascendant",
  "diamond",
  "grandmaster",
  "master",
  "celestial",
];

/** Map a tier name to its rank-color CSS variable (falls back to the primary). */
export function tierColorVar(tier: string): string {
  const key = String(tier || "").toLowerCase();
  if (
    key.includes("challenger") ||
    key.includes("radiant") ||
    key.includes("champion") ||
    key.includes("one above all") ||
    key.includes("eternity")
  ) {
    return "var(--rank-celestial)";
  }
  const match = KNOWN_TIERS.find((k) => key.includes(k));
  return match ? `var(--rank-${match})` : "var(--primary)";
}

/** The full League ladder — used only when no `rungs` are supplied. */
const DEFAULT_RUNGS: LilyRung[] = [
  "Iron",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Emerald",
  "Diamond",
  "Master",
  "Grandmaster",
  "Challenger",
].map((label) => ({ label }));

export function LilyLadder({
  rungs,
  crown = true,
  interactive = true,
  className = "",
  onStep,
  onReady,
}: {
  rungs?: LilyRung[];
  crown?: boolean;
  interactive?: boolean;
  className?: string;
  /** Fired as the intro climb reaches each step (0-based) — drives reveals. */
  onStep?: (step: number) => void;
  /** Fired once the intro climb has settled and hover is enabled. */
  onReady?: () => void;
}) {
  const items = rungs && rungs.length ? rungs : DEFAULT_RUNGS;
  const last = items.length - 1;
  const contRef = useRef<HTMLDivElement>(null);
  const pipRefs = useRef<(HTMLElement | null)[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const climbedRef = useRef(false);
  // Keep the latest callbacks in refs so the once-only climb effect never
  // re-runs just because a parent re-rendered with new closures. Assigned in an
  // effect (not during render) to satisfy the rules-of-hooks lint.
  const onStepRef = useRef(onStep);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onStepRef.current = onStep;
    onReadyRef.current = onReady;
  });

  const [pips, setPips] = useState<{ x: number; y: number }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [target, setTarget] = useState(0);
  const [hopSeq, setHopSeq] = useState(0);
  const [kind, setKind] = useState<"hop" | "leap">("hop");
  const [celebrate, setCelebrate] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const reduced =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Measure the center of each tier's pip (relative to the container) so the
  // frog can be positioned by transform. Re-measures on resize AND whenever the
  // ladder changes (game switch) — no scroll listeners.
  useLayoutEffect(() => {
    const measure = () => {
      const c = contRef.current;
      if (!c) return;
      const cr = c.getBoundingClientRect();
      const pts = pipRefs.current.slice(0, items.length).map((el) => {
        const r = el!.getBoundingClientRect();
        return { x: r.left + r.width / 2 - cr.left, y: r.top + r.height / 2 - cr.top };
      });
      setPips(pts);
      setSize({ w: cr.width, h: cr.height });
    };
    measure();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined" && contRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(contRef.current);
    }
    return () => ro?.disconnect();
  }, [items.length]);

  // Intro climb — runs ONCE (climbedRef). Slow, choreographed: hop bottom → top,
  // firing onStep at each tier, a "ta-da" at the summit, then settle at the base.
  // A game switch remeasures (above) but does not replay this.
  useEffect(() => {
    if (climbedRef.current) return;
    if (pips.length !== items.length || items.length === 0) return;
    climbedRef.current = true;
    const T = timers.current;

    const finish = () => {
      setReady(true);
      onReadyRef.current?.();
    };

    if (reduced || !crown || !interactive) {
      T.push(
        setTimeout(() => {
          setTarget(0);
          // Reveal everything at once when we're not animating the climb.
          for (let i = 0; i <= last; i += 1) onStepRef.current?.(i);
          finish();
        }, 0),
      );
      return;
    }

    let i = 0;
    const step = () => {
      if (i <= last) {
        setTarget(i);
        setKind("hop");
        setHopSeq((s) => s + 1);
        onStepRef.current?.(i);
        i += 1;
        T.push(setTimeout(step, 560));
      } else {
        setCelebrate(true);
        T.push(
          setTimeout(() => {
            setCelebrate(false);
            setTarget(0);
            setKind("hop");
            setHopSeq((s) => s + 1);
            finish();
          }, 900),
        );
      }
    };
    T.push(setTimeout(step, 500));
    return () => {
      T.forEach(clearTimeout);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pips.length]);

  const enter = (i: number) => {
    setActive(i);
    if (reduced || !ready || !interactive || !crown) return;
    setTarget(i);
    setKind("leap");
    setHopSeq((s) => s + 1);
  };
  // Persistence: leaving only hides the hint — the frog STAYS where it last
  // leapt (no snap-back to the base).
  const leave = () => setActive(null);

  const clampedTarget = Math.min(target, Math.max(0, pips.length - 1));
  const p = pips[clampedTarget];
  const fx = p ? p.x - 17 : 0;
  const fy = p ? p.y - 40 : 0;
  const first = pips[0];
  const lastPip = pips[last];
  const hintP = active != null ? pips[active] : null;
  const activeItem = active != null ? items[active] : null;
  const lit = active != null || (!reduced && crown && interactive && !ready);

  return (
    <div
      className={("rf-climb " + className).trim()}
      ref={contRef}
      style={{
        // @ts-expect-error CSS custom property
        "--n": Math.max(1, last),
      }}
      data-lit={lit ? "true" : undefined}
      role="group"
      aria-label="The ranked ladder — low tier to high tier"
    >
      <svg
        className="rf-climb-trail"
        viewBox={`0 0 ${size.w} ${size.h}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {first && lastPip && (
          <line className="base" x1={first.x} y1={first.y} x2={lastPip.x} y2={lastPip.y} />
        )}
        {first && lastPip && (
          <line className="elec" x1={first.x} y1={first.y} x2={lastPip.x} y2={lastPip.y} />
        )}
      </svg>

      {items.map((rung, i) => {
        const color = rung.colorVar || tierColorVar(rung.tier || rung.label);
        return (
          <button
            key={rung.label + i}
            type="button"
            className="rf-climb-node"
            style={{
              background: `color-mix(in oklch, ${color} 12%, var(--card))`,
              borderColor: `color-mix(in oklch, ${color} 42%, transparent)`,
              // @ts-expect-error CSS custom property
              "--i": i,
            }}
            data-active={active === i ? "true" : undefined}
            onMouseEnter={() => enter(i)}
            onMouseLeave={leave}
            onFocus={() => enter(i)}
            onBlur={leave}
          >
            <span className="g" aria-hidden="true" />
            <span
              className="pip"
              ref={(el) => {
                pipRefs.current[i] = el;
              }}
              style={{ background: color }}
            />
            <span className="lab">{rung.label}</span>
          </button>
        );
      })}

      {hintP && activeItem && (
        <div className="rf-climb-hint" style={{ left: hintP.x, top: hintP.y - 30 }}>
          <div className="t">{activeItem.label}</div>
          <div className="p">
            {activeItem.price ? `from ${activeItem.price} / division` : "Custom quote"}
          </div>
        </div>
      )}

      {crown && (
        <div
          className="rf-climb-frog"
          style={{ transform: `translate(${fx}px, ${fy}px)`, opacity: pips.length ? 1 : 0 }}
        >
          <span className="rf-climb-hopper" key={hopSeq} data-kind={reduced ? undefined : kind}>
            <FrogMascot size={30} className={celebrate ? "motion-frog-celebrate" : undefined} />
          </span>
        </div>
      )}
    </div>
  );
}
