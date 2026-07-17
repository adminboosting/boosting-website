"use client";

import { useState } from "react";
import { Coins, HelpCircle, ListChecks, ShieldCheck, Star, Users } from "lucide-react";
import { LilyLadder, type LilyRung } from "@/components/brand/lily-ladder";
import { cn } from "@/lib/utils";

/** One game's ladder data (built on the server from the catalog + availability). */
export interface ClimbGame {
  slug: string;
  name: string;
  shortName: string;
  rungs: LilyRung[];
  /** Boosters available for this game (per booster_availability). */
  boosterCount: number;
  /** Cheapest purchasable "from $X" for this game, or null. */
  fromPrice: string | null;
}

/** A real, game-agnostic content card revealed as the frog climbs. */
export interface ClimbCard {
  kind: "review" | "faq" | "step" | "trust";
  heading: string;
  body: string;
  note?: string;
  /** 1–5 for reviews. */
  rating?: number;
}

const KIND_ICON = {
  faq: HelpCircle,
  step: ListChecks,
  trust: ShieldCheck,
} as const;

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "size-3.5",
            i < rating ? "fill-crown-ink text-crown-ink" : "text-muted-foreground/30",
          )}
        />
      ))}
    </span>
  );
}

function RevealCard({ card, shown }: { card: ClimbCard; shown: boolean }) {
  return (
    <div
      data-shown={shown ? "true" : undefined}
      className={cn(
        "rounded-xl border border-border bg-card/60 p-4 shadow-sm transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      {card.kind === "review" ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <Stars rating={card.rating ?? 5} />
            {card.note && <span className="text-xs text-muted-foreground">{card.note}</span>}
          </div>
          <p className="mt-2 text-sm text-pretty">“{card.body}”</p>
          <p className="mt-1.5 text-xs font-medium text-muted-foreground">— {card.heading}</p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {(() => {
              const Icon = KIND_ICON[card.kind];
              return <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />;
            })()}
            <h3 className="text-sm font-semibold">{card.heading}</h3>
            {card.note && (
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {card.note}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-pretty text-muted-foreground">{card.body}</p>
        </>
      )}
    </div>
  );
}

/** A game-specific stat chip (booster count / starting price) in the rails. */
function StatCard({
  icon: Icon,
  value,
  label,
  shown,
  pulse = false,
}: {
  icon: typeof Users;
  value: string;
  label: string;
  shown: boolean;
  pulse?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4 shadow-sm transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <div className="flex items-center gap-1.5 text-lg font-semibold leading-none tabular-nums">
          {pulse && (
            <span className="motion-live-pulse inline-block size-2 rounded-full bg-success" />
          )}
          {value}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

/**
 * "The Climb" showcase — a game selector, the diagonal frog ladder in the
 * middle, and two rails of real content (booster availability, starting price,
 * reviews, FAQ, steps, trust) that fade in as the frog climbs. Everything is
 * derived on the server; switching games swaps the ladder + game stats without
 * replaying the intro climb.
 */
export function ClimbShowcase({ games, cards }: { games: ClimbGame[]; cards: ClimbCard[] }) {
  const [selected, setSelected] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const game = games[selected] ?? games[0];

  if (!game) return null;

  // Reveal order: the two live game stats first, then the curated content.
  // `slotShown(i)` maps to the climb's step progression via `revealed`.
  const stat0Shown = revealed > 0;
  const stat1Shown = revealed > 1;
  const cardShown = (i: number) => revealed > i + 2;

  // Distribute cards across the two rails (even → left, odd → right). The stats
  // top each rail so both open with a punchy, game-specific number.
  const leftCards = cards.filter((_, i) => i % 2 === 0);
  const rightCards = cards.filter((_, i) => i % 2 === 1);
  const shownFor = (card: ClimbCard) => cardShown(cards.indexOf(card));

  return (
    <div>
      {/* Header: label + game selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          The climb
        </p>
        <div
          className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-card/50 p-1"
          role="tablist"
          aria-label="Choose a game"
        >
          {games.map((g, i) => (
            <button
              key={g.slug}
              type="button"
              role="tab"
              aria-selected={i === selected}
              onClick={() => setSelected(i)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                i === selected
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="hidden sm:inline">{g.name}</span>
              <span className="sm:hidden">{g.shortName}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rails flank the ladder on desktop; stack under it on mobile. */}
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] lg:items-center">
        {/* Left rail */}
        <div className="order-2 space-y-4 lg:order-1">
          <StatCard
            icon={Users}
            value={`${game.boosterCount}`}
            label={`${game.name} boosters online`}
            shown={stat0Shown}
            pulse
          />
          {leftCards.map((card) => (
            <RevealCard key={card.kind + card.heading} card={card} shown={shownFor(card)} />
          ))}
        </div>

        {/* Ladder */}
        <div className="order-1 w-full lg:order-2 lg:w-[440px]">
          <LilyLadder
            rungs={game.rungs}
            onStep={(i) => setRevealed((r) => Math.max(r, i + 1))}
            onReady={() => setRevealed((r) => Math.max(r, cards.length + 2))}
          />
        </div>

        {/* Right rail */}
        <div className="order-3 space-y-4">
          <StatCard
            icon={Coins}
            value={game.fromPrice ? `${game.fromPrice}` : "Custom"}
            label={game.fromPrice ? "Starting price / division" : "Top tiers — custom quote"}
            shown={stat1Shown}
          />
          {rightCards.map((card) => (
            <RevealCard key={card.kind + card.heading} card={card} shown={shownFor(card)} />
          ))}
        </div>
      </div>
    </div>
  );
}
