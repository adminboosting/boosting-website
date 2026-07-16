"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import type { AdminActionState } from "@/app/(admin)/admin/orders/actions";
import { Button, type ButtonProps } from "@/components/ui/button";

const INITIAL_STATE: AdminActionState = { ok: false, error: null };

/**
 * One admin mutation as a form button. The server component binds every
 * argument (`recordManualPayment.bind(null, id, "confirmed")`) and passes the
 * bound action down; this wrapper only adds pending/error presentation, so
 * nothing here is a trust boundary — the action re-verifies the admin role
 * and re-validates the status walk itself.
 */
export function AdminActionButton({
  action,
  label,
  variant = "outline",
}: {
  action: () => Promise<AdminActionState>;
  label: string;
  variant?: ButtonProps["variant"];
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    // The bound action carries all its args — the form payload is ignored.
    () => action(),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <Button type="submit" size="sm" variant={variant} disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {label}
      </Button>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
