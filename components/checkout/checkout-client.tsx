"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import { createOrder } from "@/app/(shop)/checkout/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ServiceType } from "@/lib/catalog/types";
import { formatUsdFromCents } from "@/lib/money";
import type { Quote } from "@/lib/pricing/types";
import { checkoutRequestSchema, type CheckoutRequest } from "@/lib/schemas/checkout";
import { cn } from "@/lib/utils";

/**
 * sessionStorage key contract with the calculator: holds the exact QuoteRequest
 * JSON the calculator last POSTed to /api/quote. sessionStorage — never URL
 * params — so selections don't leak into logs or shared links.
 */
const CHECKOUT_INTENT_KEY = "rf.checkout.intent";

/** Display labels for the read-only summary (mirrors lib/catalog/content.ts). */
const SERVICE_LABELS: Record<ServiceType, string> = {
  rank_boost: "Rank Boost",
  placements: "Placement Matches",
  net_wins: "Ranked Net Wins",
};

/** Money-page slugs, for the "edit selection" link back to the calculator. */
const SERVICE_SLUGS: Record<ServiceType, string> = {
  rank_boost: "rank-boost",
  placements: "placements",
  net_wins: "net-wins",
};

const MODE_LABELS = { piloted: "Piloted", duo: "Duo / self-play" } as const;

/**
 * The client half of checkout. Reads the intent from sessionStorage on mount,
 * re-quotes it against /api/quote so the summary is always server-priced (the
 * stored payload is selections only), and submits those same selections to the
 * createOrder server action — prices never travel client → server. On success
 * the action redirects to the order page, so there is no client navigation.
 */
export function CheckoutClient({
  gameNames,
  storeCreditCents,
}: {
  gameNames: Record<string, string>;
  storeCreditCents: number;
}) {
  const [intent, setIntent] = useState<CheckoutRequest | null>(null);
  const [intentChecked, setIntentChecked] = useState(false);
  const [applyCredit, setApplyCredit] = useState(false);

  // sessionStorage is browser-only — read once after mount. A missing, corrupt,
  // or stale-shaped intent all land on the same empty state. Deferred a tick so
  // the state lands asynchronously (same pattern as the calculator's fetch).
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem(CHECKOUT_INTENT_KEY);
        const parsed = raw ? checkoutRequestSchema.safeParse(JSON.parse(raw)) : null;
        setIntent(parsed?.success ? parsed.data : null);
      } catch {
        setIntent(null);
      } finally {
        setIntentChecked(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // The exact payload sent to /api/quote AND to createOrder — selections only.
  const payload = useMemo<CheckoutRequest | null>(
    () => (intent ? { ...intent, applyStoreCredit: applyCredit || undefined } : null),
    [intent, applyCredit],
  );

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fresh server-priced summary (same conventions as the calculator's fetch).
  useEffect(() => {
    if (!payload) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const data = (await res.json()) as { quote?: Quote; error?: string };
        if (res.ok && data.quote) {
          setQuote(data.quote);
          setQuoteError(null);
        } else {
          setQuote(null);
          setQuoteError(data.error ?? "Couldn't price this configuration.");
        }
      } catch {
        if (!controller.signal.aborted) setQuoteError("Network error — try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [payload]);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handlePlaceOrder() {
    if (!payload) return;
    setSubmitError(null);
    startTransition(async () => {
      // On success createOrder redirects (never resolves with a value here).
      const result = await createOrder(payload);
      if (result?.error) setSubmitError(result.error);
    });
  }

  if (!intentChecked) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!intent) {
    return (
      <div className="rounded-xl border border-border bg-card/40 p-8 text-center">
        <h2 className="font-semibold">Nothing to check out yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Build your boost in the price calculator first — your selections carry over here.
        </p>
        <Link href="/games" className={cn(buttonVariants(), "mt-5")}>
          Browse games
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      {/* Left column: read-only selection, store credit, payment method */}
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card/40 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Your selection</h2>
            <Link
              href={`/${intent.gameSlug}/${SERVICE_SLUGS[intent.serviceType]}`}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              Edit in calculator
            </Link>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <SummaryRow label="Game" value={gameNames[intent.gameSlug] ?? intent.gameSlug} />
            <SummaryRow label="Service" value={SERVICE_LABELS[intent.serviceType]} />
            <SummaryRow label="Mode" value={MODE_LABELS[intent.mode]} />
            <SummaryRow label="Region" value={intent.regionCode.toUpperCase()} />
            {intent.couponCode && (
              <SummaryRow label="Coupon" value={intent.couponCode.toUpperCase()} />
            )}
          </dl>
        </section>

        {storeCreditCents > 0 && (
          <section className="rounded-xl border border-border bg-card/40 p-5">
            <h2 className="font-semibold">Store credit</h2>
            <label
              className={cn(
                "mt-4 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                applyCredit
                  ? "border-primary/60 bg-primary/5"
                  : "border-border hover:bg-secondary/40",
              )}
            >
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--primary)]"
                checked={applyCredit}
                onChange={(e) => setApplyCredit(e.target.checked)}
              />
              <span className="flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Apply store credit</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatUsdFromCents(storeCreditCents)} available
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Credit is applied when the order is placed — your final total shows on the order
                  page.
                </span>
              </span>
            </label>
          </section>
        )}

        <section className="rounded-xl border border-border bg-card/40 p-5">
          <h2 className="font-semibold">Payment method</h2>
          <div className="mt-4 rounded-lg border border-primary bg-primary/5 p-4">
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Manual / crypto</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                Pay after checkout
              </span>
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Place the order first — payment instructions appear on your order page and we confirm
              manually. Nothing is charged automatically at checkout.
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            By placing this order you agree to our{" "}
            <Link
              href="/legal/terms"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/legal/refund-policy"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Refund Policy
            </Link>
            .
          </p>
        </section>
      </div>

      {/* Right column: server-priced order summary */}
      <div className="lg:sticky lg:top-20 lg:h-fit">
        <div className="rounded-xl border border-border bg-card/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Order summary</h2>
            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>

          {quoteError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{quoteError}</span>
            </div>
          )}

          {quote && !quoteError && (
            <>
              <dl className="mt-4 space-y-2 text-sm">
                {quote.lines.map((line, i) => (
                  <div key={`${line.key}-${i}`} className="flex items-center justify-between gap-3">
                    <dt
                      className={cn(
                        "text-muted-foreground",
                        line.kind === "base" && "text-foreground",
                      )}
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
                  <span className="text-2xl font-bold tabular-nums" aria-live="polite">
                    {formatUsdFromCents(quote.totalCents)}
                  </span>
                </div>
                <p className="mt-1 text-right text-xs text-muted-foreground">
                  Est. {quote.etaHours} hours
                </p>
              </div>

              {quote.cashbackPreviewCents > 0 && (
                <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent">
                  You&rsquo;ll earn {formatUsdFromCents(quote.cashbackPreviewCents)} in cashback
                  credit.
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

          {submitError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <Button
            type="button"
            size="lg"
            className="mt-5 w-full"
            disabled={pending || loading || !quote}
            onClick={handlePlaceOrder}
          >
            {pending && <Loader2 className="animate-spin" />}
            Place order
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            The final price is re-checked on our server when you place the order.
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
