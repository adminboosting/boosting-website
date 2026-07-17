"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import {
  saveBoosterAvailability,
  type SettingFormState,
} from "@/app/(admin)/admin/settings/actions";
import { Button } from "@/components/ui/button";
import type { BoosterAvailabilityMode } from "@/lib/boosters/availability";
import { cn } from "@/lib/utils";

const INITIAL_STATE: SettingFormState = { ok: false, error: null };

interface GameField {
  slug: string;
  name: string;
  /** Admin-entered count for this game (manual mode). */
  manual: number;
  /** What live tracking currently reports, or null when unavailable. */
  live: number | null;
}

/**
 * Structured editor for `booster_availability`. Manual mode = admin-typed counts
 * (the placeholder path); live mode derives from real booster_profiles. Total is
 * always the sum, shown live as the numbers change. Writes through
 * saveBoosterAvailability (service role; see settings/actions.ts).
 */
export function BoosterAvailabilityForm({
  initialMode,
  games,
  liveTotal,
}: {
  initialMode: BoosterAvailabilityMode;
  games: GameField[];
  liveTotal: number | null;
}) {
  const [state, formAction, pending] = useActionState(saveBoosterAvailability, INITIAL_STATE);
  const [mode, setMode] = useState<BoosterAvailabilityMode>(initialMode);
  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(games.map((g) => [g.slug, g.manual])),
  );

  const manualTotal = games.reduce((acc, g) => acc + (counts[g.slug] ?? 0), 0);
  const shownTotal = mode === "live" ? (liveTotal ?? 0) : manualTotal;

  const inputClass =
    "h-9 w-20 rounded-md border border-input bg-transparent px-3 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

  return (
    <form action={formAction} className="rounded-xl border border-border bg-card/40 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-mono text-sm font-semibold">booster_availability</h3>
        {state.ok && !pending && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="size-3.5" />
            Saved
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Boosters available per game, shown across the site (the climb, etc.). Total is the sum:{" "}
        <span className="font-semibold text-foreground tabular-nums">{shownTotal}</span> boosters.
      </p>

      {/* Mode */}
      <input type="hidden" name="mode" value={mode} />
      <div className="mt-4 inline-flex rounded-lg border border-border p-0.5">
        {(["manual", "live"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              mode === m ? "bg-secondary text-foreground" : "text-muted-foreground",
            )}
            aria-pressed={mode === m}
          >
            {m}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {mode === "manual"
          ? "Manual — type the numbers to display now (placeholder until real boosters onboard)."
          : liveTotal === null
            ? "Live — derived from real boosters. (No database on this deployment; falls back to manual.)"
            : "Live — counts come from real accepting boosters; the numbers below are ignored."}
      </p>

      {/* Per-game counts */}
      <div className="mt-4 space-y-2">
        {games.map((g) => (
          <div key={g.slug} className="flex items-center justify-between gap-3">
            <label htmlFor={`count_${g.slug}`} className="text-sm">
              {g.name}
              {g.live !== null && (
                <span className="ml-2 text-xs text-muted-foreground">live: {g.live}</span>
              )}
            </label>
            <input
              id={`count_${g.slug}`}
              name={`count_${g.slug}`}
              type="number"
              min={0}
              max={9999}
              inputMode="numeric"
              value={counts[g.slug] ?? 0}
              disabled={mode === "live"}
              onChange={(e) =>
                setCounts((c) => ({ ...c, [g.slug]: Math.max(0, Number(e.target.value) || 0) }))
              }
              className={inputClass}
            />
          </div>
        ))}
      </div>

      {state.error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="mt-4">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  );
}
