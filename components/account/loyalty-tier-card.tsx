import { Coins, Crown } from "lucide-react";
import { formatBpAsPercent, getLoyaltyProgress } from "@/lib/loyalty/view";
import { formatUsdFromCents } from "@/lib/money";

/**
 * Loyalty tier card for the account page (server component, pure props — the
 * page already holds both balances via SessionProfile, so no extra query).
 * Shows the current tier's perks, progress toward the next tier, and the
 * store-credit balance (this card replaces the old header pill).
 */
export function LoyaltyTierCard({
  lifetimeSpendCents,
  storeCreditCents,
}: {
  lifetimeSpendCents: number;
  storeCreditCents: number;
}) {
  const { tier, nextTier, remainingCents, progressPct } = getLoyaltyProgress(lifetimeSpendCents);

  return (
    <section
      aria-labelledby="loyalty-heading"
      className="mt-8 rounded-xl border border-border bg-card/40 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Crown className="size-4 text-accent" aria-hidden="true" />
          <h2 id="loyalty-heading" className="text-sm font-semibold">
            Loyalty
          </h2>
          <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {tier.name}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Coins className="size-4 text-accent" aria-hidden="true" />
          <span className="text-muted-foreground">Store credit</span>
          <span className="font-semibold tabular-nums">{formatUsdFromCents(storeCreditCents)}</span>
        </div>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {formatBpAsPercent(tier.discountBp)} off every order · {formatBpAsPercent(tier.cashbackBp)}{" "}
        cashback as store credit
      </p>

      {nextTier ? (
        <div className="mt-3">
          <div
            role="progressbar"
            aria-label={`Progress to ${nextTier.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            className="h-2 overflow-hidden rounded-full bg-muted/40"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatUsdFromCents(remainingCents)} to {nextTier.name} (
            {formatBpAsPercent(nextTier.discountBp)} off · {formatBpAsPercent(nextTier.cashbackBp)}{" "}
            cashback)
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Top tier unlocked — you&rsquo;re on the best rates we offer.
        </p>
      )}
    </section>
  );
}
