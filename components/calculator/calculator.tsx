"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { GameSlug, PlacementBand, ServiceType } from "@/lib/catalog/types";
import type { Quote } from "@/lib/pricing/types";
import { formatUsdFromCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface CalcRank {
  sortIndex: number;
  label: string;
  tier: string;
  isPurchasable: boolean;
}
export interface CalcRegion {
  code: string;
  label: string;
  isDefault: boolean;
}
export interface CalcModifier {
  key: string;
  label: string;
  description: string;
  kind: "percent" | "flat";
  amount: number;
  isDefaultOn: boolean;
  hiddenInDuo: boolean;
}
export interface CalcPlacementBand {
  band: PlacementBand;
  label: string;
  minGames: number;
  maxGames: number;
}
export interface CalculatorCatalog {
  gameSlug: GameSlug;
  serviceType: ServiceType;
  ranks: CalcRank[];
  regions: CalcRegion[];
  modifiers: CalcModifier[];
  placementBands: CalcPlacementBand[];
  duoMultiplierBp: number;
  volumeDiscounts: { minCents: number; bp: number }[];
  isLoL: boolean;
}

const LP_BANDS: Array<{ value: 0 | 25 | 50 | 75; label: string }> = [
  { value: 0, label: "0–20 LP" },
  { value: 25, label: "21–40 LP" },
  { value: 50, label: "41–60 LP" },
  { value: 75, label: "61+ LP" },
];

export function Calculator({ catalog }: { catalog: CalculatorCatalog }) {
  const purchasable = useMemo(() => catalog.ranks.filter((r) => r.isPurchasable), [catalog.ranks]);
  const firstIdx = purchasable[0]?.sortIndex ?? 0;
  const secondIdx = purchasable[1]?.sortIndex ?? firstIdx;
  const defaultRegion =
    catalog.regions.find((r) => r.isDefault)?.code ?? catalog.regions[0]?.code ?? "na";

  // Common state
  const [mode, setMode] = useState<"piloted" | "duo">("piloted");
  const [regionCode, setRegionCode] = useState(defaultRegion);
  const [modifierKeys, setModifierKeys] = useState<string[]>(
    catalog.modifiers.filter((m) => m.isDefaultOn).map((m) => m.key),
  );
  const [couponCode, setCouponCode] = useState("");

  // Rank boost
  const [currentRankIndex, setCurrentRankIndex] = useState(firstIdx);
  const [desiredRankIndex, setDesiredRankIndex] = useState(secondIdx);
  const [currentLpBand, setCurrentLpBand] = useState<0 | 25 | 50 | 75>(0);
  const [lpGainBand, setLpGainBand] = useState<"normal" | "low">("normal");
  const [queue, setQueue] = useState<"solo" | "flex">("solo");

  // Placements
  const firstBand = catalog.placementBands[0];
  const [previousBand, setPreviousBand] = useState<PlacementBand>(
    firstBand?.band ?? "unranked_low",
  );
  const [gamesCount, setGamesCount] = useState(firstBand?.minGames ?? 1);

  // Net wins
  const [winsCount, setWinsCount] = useState(1);
  const [nwRankIndex, setNwRankIndex] = useState(firstIdx);

  // Keep desired above current when the current rank changes (handled in the
  // event handler, not an effect).
  function handleCurrentRankChange(value: string) {
    const ci = Number(value);
    setCurrentRankIndex(ci);
    if (desiredRankIndex <= ci) {
      const next = purchasable.find((r) => r.sortIndex > ci);
      if (next) setDesiredRankIndex(next.sortIndex);
    }
  }

  const visibleModifiers = catalog.modifiers.filter((m) => !(mode === "duo" && m.hiddenInDuo));

  const requestBody = useMemo(() => {
    const effectiveModifierKeys = modifierKeys.filter((k) =>
      visibleModifiers.some((m) => m.key === k),
    );
    const common = {
      gameSlug: catalog.gameSlug,
      mode,
      regionCode,
      modifierKeys: effectiveModifierKeys,
      couponCode: couponCode.trim() || undefined,
    };
    if (catalog.serviceType === "rank_boost") {
      return {
        ...common,
        serviceType: "rank_boost" as const,
        config: {
          currentRankIndex,
          desiredRankIndex,
          ...(catalog.isLoL ? { currentLpBand, lpGainBand, queue } : {}),
        },
      };
    }
    if (catalog.serviceType === "placements") {
      return {
        ...common,
        serviceType: "placements" as const,
        config: { gamesCount, previousBand },
      };
    }
    return {
      ...common,
      serviceType: "net_wins" as const,
      config: { winsCount, currentRankIndex: nwRankIndex },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    catalog,
    mode,
    regionCode,
    modifierKeys,
    couponCode,
    currentRankIndex,
    desiredRankIndex,
    currentLpBand,
    lpGainBand,
    queue,
    gamesCount,
    previousBand,
    winsCount,
    nwRankIndex,
  ]);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        const data = (await res.json()) as { quote?: Quote; error?: string };
        if (res.ok && data.quote) {
          setQuote(data.quote);
          setError(null);
        } else {
          setQuote(null);
          setError(data.error ?? "Couldn't price this configuration.");
        }
      } catch {
        if (!controller.signal.aborted) setError("Network error — try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [requestBody]);

  function toggleModifier(key: string) {
    setModifierKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      {/* Controls */}
      <div className="space-y-8">
        {catalog.serviceType === "rank_boost" && (
          <Section title="Your rank" step={1}>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Current rank"
                value={currentRankIndex}
                onChange={handleCurrentRankChange}
                options={purchasable
                  .slice(0, -1)
                  .map((r) => ({ value: r.sortIndex, label: r.label }))}
              />
              <SelectField
                label="Desired rank"
                value={desiredRankIndex}
                onChange={(v) => setDesiredRankIndex(Number(v))}
                options={purchasable
                  .filter((r) => r.sortIndex > currentRankIndex)
                  .map((r) => ({ value: r.sortIndex, label: r.label }))}
              />
            </div>
            {catalog.isLoL && (
              <div className="mt-4 space-y-4">
                <ChipGroup
                  label="Current LP"
                  value={currentLpBand}
                  onChange={(v) => setCurrentLpBand(v as 0 | 25 | 50 | 75)}
                  options={LP_BANDS}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <ChipGroup
                    label="LP gain per win"
                    value={lpGainBand}
                    onChange={(v) => setLpGainBand(v as "normal" | "low")}
                    options={[
                      { value: "normal", label: "Normal" },
                      { value: "low", label: "Low (<20)" },
                    ]}
                  />
                  <ChipGroup
                    label="Queue"
                    value={queue}
                    onChange={(v) => setQueue(v as "solo" | "flex")}
                    options={[
                      { value: "solo", label: "Solo/Duo" },
                      { value: "flex", label: "Flex" },
                    ]}
                  />
                </div>
              </div>
            )}
          </Section>
        )}

        {catalog.serviceType === "placements" && (
          <Section title="Your placements" step={1}>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Last season's rank"
                value={previousBand}
                onChange={(v) => setPreviousBand(v as PlacementBand)}
                options={catalog.placementBands.map((b) => ({ value: b.band, label: b.label }))}
              />
              <Stepper
                label="Number of games"
                value={gamesCount}
                min={firstBand?.minGames ?? 1}
                max={firstBand?.maxGames ?? 10}
                onChange={setGamesCount}
              />
            </div>
          </Section>
        )}

        {catalog.serviceType === "net_wins" && (
          <Section title="Your net wins" step={1}>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Current rank"
                value={nwRankIndex}
                onChange={(v) => setNwRankIndex(Number(v))}
                options={catalog.ranks.map((r) => ({ value: r.sortIndex, label: r.label }))}
              />
              <Stepper
                label="Number of wins"
                value={winsCount}
                min={1}
                max={10}
                onChange={setWinsCount}
              />
            </div>
          </Section>
        )}

        <Section title="Fulfilment mode" step={2}>
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard
              active={mode === "piloted"}
              onClick={() => setMode("piloted")}
              title="Piloted"
              body="A booster logs in and plays for you. Fastest."
              badge="Standard"
            />
            <ModeCard
              active={mode === "duo"}
              onClick={() => setMode("duo")}
              title="Duo / self-play"
              body="You play in the same games as the booster. You stay in control."
              badge={`+${catalog.duoMultiplierBp / 100}%`}
            />
          </div>
        </Section>

        <Section title="Region" step={3}>
          <SelectField
            label="Server region"
            value={regionCode}
            onChange={setRegionCode}
            options={catalog.regions.map((r) => ({ value: r.code, label: r.label }))}
          />
        </Section>

        {visibleModifiers.length > 0 && (
          <Section title="Options" step={4}>
            <div className="space-y-2">
              {visibleModifiers.map((mod) => {
                const checked = modifierKeys.includes(mod.key);
                return (
                  <label
                    key={mod.key}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                      checked
                        ? "border-primary/60 bg-primary/5"
                        : "border-border hover:bg-secondary/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--primary)]"
                      checked={checked}
                      onChange={() => toggleModifier(mod.key)}
                    />
                    <span className="flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{mod.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {mod.kind === "percent" ? `+${mod.amount / 100}%` : "Free"}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {mod.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Section>
        )}
      </div>

      {/* Price panel */}
      <div className="lg:sticky lg:top-20 lg:h-fit">
        <PricePanel
          quote={quote}
          error={error}
          loading={loading}
          couponCode={couponCode}
          onCouponChange={setCouponCode}
          volumeDiscounts={catalog.volumeDiscounts}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price panel
// ---------------------------------------------------------------------------

function PricePanel({
  quote,
  error,
  loading,
  couponCode,
  onCouponChange,
  volumeDiscounts,
}: {
  quote: Quote | null;
  error: string | null;
  loading: boolean;
  couponCode: string;
  onCouponChange: (v: string) => void;
  volumeDiscounts: { minCents: number; bp: number }[];
}) {
  const subtotal = quote ? quote.baseCents + quote.modifiersCents : 0;
  const nudge = quote ? volumeNudge(subtotal, volumeDiscounts) : null;
  const eta = quote?.etaHours ?? 0;
  const etaLow = Math.max(1, Math.round(eta * 0.8 * 2) / 2);
  const etaHigh = Math.round(eta * 1.2 * 2) / 2;

  return (
    <div className="rounded-xl border border-border bg-card/70 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Your price</h3>
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {quote && !error && (
        <>
          <dl className="mt-4 space-y-2 text-sm">
            {quote.lines.map((line, i) => (
              <div key={`${line.key}-${i}`} className="flex items-center justify-between gap-3">
                <dt
                  className={cn("text-muted-foreground", line.kind === "base" && "text-foreground")}
                >
                  {line.label}
                </dt>
                <dd
                  className={cn(
                    "tabular-nums",
                    line.amountCents < 0 ? "text-success" : "text-foreground",
                  )}
                >
                  {line.amountCents < 0 ? "−" : ""}
                  {formatUsdFromCents(Math.abs(line.amountCents))}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-end justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span
                className="text-2xl font-bold tabular-nums"
                aria-live="polite"
                aria-atomic="true"
              >
                {formatUsdFromCents(quote.totalCents)}
              </span>
            </div>
            <p className="mt-1 text-right text-xs text-muted-foreground">
              Est. {etaLow === etaHigh ? `${etaLow}` : `${etaLow}–${etaHigh}`} hours
            </p>
          </div>

          {quote.cashbackPreviewCents > 0 && (
            <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent">
              You&rsquo;ll earn {formatUsdFromCents(quote.cashbackPreviewCents)} in cashback credit.
            </p>
          )}

          {nudge && (
            <p className="mt-3 text-xs text-muted-foreground">
              Add {formatUsdFromCents(nudge.needCents)} to unlock {nudge.percent}% off with the
              volume discount.
            </p>
          )}

          {quote.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-warning">
              {quote.warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="mt-5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="coupon">
          Coupon code
        </label>
        <input
          id="coupon"
          value={couponCode}
          onChange={(e) => onCouponChange(e.target.value)}
          placeholder="e.g. WELCOME10"
          className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm uppercase placeholder:normal-case placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <button
        type="button"
        disabled
        title="Checkout opens in the next release"
        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground opacity-70"
      >
        Continue to checkout
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Sign-in &amp; secure checkout arrive in the next release.
      </p>
    </div>
  );
}

function volumeNudge(
  subtotal: number,
  bands: { minCents: number; bp: number }[],
): { needCents: number; percent: number } | null {
  const next = bands
    .filter((b) => b.minCents > subtotal)
    .sort((a, b) => a.minCents - b.minCents)[0];
  if (!next) return null;
  return { needCents: next.minCents - subtotal, percent: next.bp / 100 };
}

// ---------------------------------------------------------------------------
// Small field components
// ---------------------------------------------------------------------------

function Section({
  title,
  step,
  children,
}: {
  title: string;
  step: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/40 p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <span className="grid size-6 place-items-center rounded-full bg-primary/15 text-xs text-primary">
          {step}
        </span>
        {title}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  options: Array<{ value: string | number; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">
        {label} ({min}–{max})
      </span>
      <div className="mt-1 flex h-10 items-stretch overflow-hidden rounded-md border border-input">
        <button
          type="button"
          aria-label="Decrease"
          onClick={() => onChange(clamp(value - 1))}
          className="w-10 shrink-0 bg-secondary/60 text-lg hover:bg-secondary"
        >
          −
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
          className="w-full bg-card text-center text-sm tabular-nums focus-visible:outline-none"
        />
        <button
          type="button"
          aria-label="Increase"
          onClick={() => onChange(clamp(value + 1))}
          className="w-10 shrink-0 bg-secondary/60 text-lg hover:bg-secondary"
        >
          +
        </button>
      </div>
    </label>
  );
}

function ChipGroup<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              value === o.value
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:bg-secondary/40",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  body,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
  badge: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-4 text-left transition-colors",
        active ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/40",
      )}
    >
      <span className="flex items-center justify-between">
        <span className="font-medium">{title}</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
          {badge}
        </span>
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{body}</span>
    </button>
  );
}
