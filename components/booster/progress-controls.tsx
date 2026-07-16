"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  advanceOrderStatus,
  type BoosterActionState,
} from "@/app/(booster)/booster/orders/[id]/actions";
import { Button, type ButtonProps } from "@/components/ui/button";
import { BOOSTER_ALLOWED_TARGETS, type OrderStatus } from "@/lib/orders/transitions";

const INITIAL_STATE: BoosterActionState = { ok: false, error: null };

/**
 * The booster's legal next steps (Start job / Pause / Resume / Mark completed)
 * per BOOSTER_ALLOWED_TARGETS, with one shared optional note that rides along
 * as a hidden field. Follows the AdminActionButton pattern — every argument is
 * bound server-action-side and this component is pure presentation; the action
 * re-verifies identity, the active assignment, and the transition walk itself.
 * Completion gets an explicit confirm step before anything is submitted.
 */
export function ProgressControls({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const targets =
    (BOOSTER_ALLOWED_TARGETS as Partial<Record<OrderStatus, readonly OrderStatus[]>>)[status] ?? [];
  const [note, setNote] = useState("");

  // Terminal / not-yet-workable statuses have no booster moves — render
  // nothing rather than an empty card.
  if (targets.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <h2 className="font-semibold">Update progress</h2>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-muted-foreground">
          Note for the customer (optional)
        </span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          rows={2}
          placeholder="e.g. Two wins tonight — Gold II reached"
          className="mt-1 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {targets.map((target) => (
          <AdvanceForm key={target} orderId={orderId} from={status} target={target} note={note} />
        ))}
      </div>
    </div>
  );
}

function actionLabel(from: OrderStatus, target: OrderStatus): string {
  if (target === "in_progress") return from === "paused" ? "Resume" : "Start job";
  if (target === "paused") return "Pause";
  return "Mark completed";
}

function actionVariant(target: OrderStatus): ButtonProps["variant"] {
  return target === "paused" ? "outline" : "default";
}

/**
 * One target as its own form (own useActionState), sharing the parent's note
 * via a hidden field. "Mark completed" arms a confirm step first — completing
 * notifies the customer and locks the order, so a stray click must not do it.
 */
function AdvanceForm({
  orderId,
  from,
  target,
  note,
}: {
  orderId: string;
  from: OrderStatus;
  target: OrderStatus;
  note: string;
}) {
  const [state, formAction, pending] = useActionState<BoosterActionState, FormData>(
    advanceOrderStatus.bind(null, orderId, target),
    INITIAL_STATE,
  );
  const [confirming, setConfirming] = useState(false);
  const needsConfirm = target === "completed";

  if (needsConfirm && !confirming) {
    return (
      <Button type="button" size="sm" variant="default" onClick={() => setConfirming(true)}>
        Mark completed
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="note" value={note} />
      {needsConfirm && (
        <p className="text-xs text-muted-foreground">
          This notifies the customer and locks the order.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant={actionVariant(target)} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {needsConfirm ? "Confirm completion" : actionLabel(from, target)}
        </Button>
        {needsConfirm && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Keep working
          </Button>
        )}
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
