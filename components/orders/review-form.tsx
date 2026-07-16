"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Loader2, Star } from "lucide-react";
import { submitReview, type SubmitReviewState } from "@/app/(shop)/orders/[id]/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const INITIAL_STATE: SubmitReviewState = { ok: false, error: null };

/**
 * Review form for a completed order, posting to the `submitReview` server
 * action with orderId bound (mirrors credential-form.tsx). The star picker is
 * hand-rolled (role="radiogroup" over buttons + a hidden input — no new deps);
 * publishing is moderation, so the copy says the review appears publicly only
 * after approval and the action hardcodes `is_published: false` regardless of
 * anything sent here.
 */
export function ReviewForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(
    submitReview.bind(null, orderId),
    INITIAL_STATE,
  );
  const [rating, setRating] = useState(0);

  if (state.ok) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
        <Star className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>
          Thanks for the review! It&rsquo;ll appear on the site once our team approves it.
        </span>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-border bg-card/40 p-5">
      {state.error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <div>
        <span id="review-rating-label" className="text-xs font-medium text-muted-foreground">
          Rating
        </span>
        <div
          role="radiogroup"
          aria-labelledby="review-rating-label"
          className="mt-1 flex items-center gap-1"
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={value === 1 ? "1 star" : `${value} stars`}
              onClick={() => setRating(value)}
              className="rounded-md p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Star
                aria-hidden="true"
                className={cn(
                  "size-6",
                  value <= rating ? "fill-accent text-accent" : "text-muted-foreground",
                )}
              />
            </button>
          ))}
        </div>
        {/* The action re-validates (1–5) — this input is just the form carrier. */}
        <input type="hidden" name="rating" value={rating === 0 ? "" : rating} />
      </div>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">
          How did your boost go? (optional)
        </span>
        <textarea
          name="body"
          maxLength={2000}
          rows={4}
          placeholder="A sentence or two helps other players."
          className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <p className="text-xs text-muted-foreground">
        Reviews are checked by a human before they appear publicly — no bots, no fakes.
      </p>

      <Button type="submit" disabled={pending || rating === 0} className="w-full">
        {pending && <Loader2 className="animate-spin" />}
        Submit review
      </Button>
    </form>
  );
}
