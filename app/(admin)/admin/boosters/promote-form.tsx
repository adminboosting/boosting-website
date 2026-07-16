"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { promoteBooster, type PromoteBoosterState } from "@/app/(admin)/admin/boosters/actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: PromoteBoosterState = { ok: false, error: null, promoted: null };

/**
 * Promote-to-booster form (email or user id). Presentation only — the action
 * re-verifies the admin role, resolves the identifier, and does every write
 * through the service role (booster_profiles has no authenticated INSERT
 * grant; see boosters/actions.ts).
 */
export function PromoteBoosterForm() {
  const [state, formAction, pending] = useActionState(promoteBooster, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-3">
      {state.error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}
      {state.ok && state.promoted && (
        <div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          <span>Promoted {state.promoted} to booster.</span>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1">
          <span className="text-xs font-medium text-muted-foreground">Email or user id</span>
          <input
            name="identifier"
            type="text"
            required
            maxLength={254}
            autoComplete="off"
            placeholder="booster@example.com"
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Promote to booster
        </Button>
      </div>
    </form>
  );
}
