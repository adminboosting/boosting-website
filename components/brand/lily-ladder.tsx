import { FrogMascot } from "@/components/brand/frog-mascot";
import { cn } from "@/lib/utils";

/**
 * THE signature element (spec C4) — the ranked ladder as a climb of lily pads,
 * the crowned frog waiting on the top pad ("king of the ladder"). Each pad rests
 * on a colored underside edge and sends a ripple across the pond on hover. This
 * is where the design spends its boldness; everything around it stays quiet.
 *
 * Pure CSS interaction (no JS) and the ripple is disabled under reduced motion by
 * the global rule in globals.css. Tokens only — the tier hue is passed as a CSS
 * variable (a `--rank-*` token), never a raw color.
 */
export interface LilyRung {
  label: string;
  /** A rank-tier CSS variable, e.g. "var(--rank-gold)". */
  colorVar: string;
}

export function LilyLadder({
  rungs,
  className,
  crown = true,
}: {
  rungs: LilyRung[];
  className?: string;
  crown?: boolean;
}) {
  return (
    <ol
      className={cn("flex flex-col-reverse gap-2", className)}
      aria-label="The ranked ladder, low tier to high tier"
    >
      {rungs.map((rung, i) => {
        const isTop = i === rungs.length - 1;
        return (
          <li
            key={rung.label}
            className="group relative flex items-center"
            style={{ marginInlineStart: `calc(var(--spacing) * ${i * 3})` }}
          >
            {/* the pad — the top (goal) pad glows electric */}
            <div
              className="relative flex items-center gap-2.5 rounded-full border py-1.5 pl-2.5 pr-4 shadow-sm transition-transform duration-[var(--duration-base)] ease-[var(--ease-spring)] group-hover:-translate-y-0.5"
              style={{
                background: "color-mix(in oklch, var(--rung-hue) 14%, var(--card))",
                borderColor: isTop
                  ? "color-mix(in oklch, var(--electric-strong) 55%, transparent)"
                  : "color-mix(in oklch, var(--rung-hue) 35%, transparent)",
                boxShadow: isTop
                  ? "0 0 0 1.5px var(--electric-strong), 0 8px 26px -8px var(--glow)"
                  : undefined,
                // @ts-expect-error CSS custom property
                "--rung-hue": rung.colorVar,
              }}
            >
              {/* the bud + its ripple */}
              <span className="relative grid size-4 place-items-center">
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full opacity-0 group-hover:animate-[pond-ripple_var(--duration-slower)_var(--ease-ripple)]"
                  style={{ background: "color-mix(in oklch, var(--rung-hue) 45%, transparent)" }}
                />
                <span className="size-2.5 rounded-full" style={{ background: "var(--rung-hue)" }} />
              </span>
              <span className="text-sm font-medium text-foreground">{rung.label}</span>

              {crown && isTop && (
                <FrogMascot
                  size={30}
                  className="absolute -right-2 -top-6 motion-safe:animate-[crown-bob_3s_var(--ease-in-out)_infinite] motion-frog-hop"
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Map a tier name to its rank-color CSS variable (falls back to the pond). */
export function tierColorVar(tier: string): string {
  const key = tier.toLowerCase();
  const known = [
    "iron",
    "bronze",
    "silver",
    "gold",
    "platinum",
    "emerald",
    "diamond",
    "master",
    "grandmaster",
    "celestial",
  ];
  const match = known.find((k) => key.includes(k));
  return match ? `var(--rank-${match})` : "var(--primary)";
}
