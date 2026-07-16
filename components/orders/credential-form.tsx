"use client";

import { useActionState } from "react";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { submitCredentials, type SubmitCredentialsState } from "@/app/(shop)/orders/[id]/actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: SubmitCredentialsState = { ok: false, error: null };

/**
 * Game-account login form for piloted orders, posting to the
 * `submitCredentials` server action with orderId bound. On success it swaps to
 * the same "credentials received" note the order page renders server-side
 * (after revalidation the page shows that note itself on reload).
 * autocomplete is off throughout — these are the customer's GAME credentials,
 * and neither the browser nor a password manager should capture them.
 */
export function CredentialForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(
    submitCredentials.bind(null, orderId),
    INITIAL_STATE,
  );

  if (state.ok) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
        <span>
          Credentials received — stored encrypted (AES-256-GCM) and deleted automatically after your
          order completes.
        </span>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      autoComplete="off"
      className="space-y-4 rounded-xl border border-border bg-card/40 p-5"
    >
      {state.error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <TextField label="Account username" name="username" type="text" maxLength={120} required />
      <TextField
        label="Account password"
        name="password"
        type="password"
        maxLength={200}
        required
      />

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">
          Note for your booster (optional)
        </span>
        <textarea
          name="note"
          maxLength={500}
          rows={3}
          autoComplete="off"
          className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        Encrypted with AES-256-GCM before storage; deleted automatically after your order completes.
      </p>

      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2 className="animate-spin" />}
        Submit credentials
      </Button>
    </form>
  );
}

function TextField({
  label,
  name,
  type,
  maxLength,
  required,
}: {
  label: string;
  name: string;
  type: string;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete="off"
        maxLength={maxLength}
        required={required}
        className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}
