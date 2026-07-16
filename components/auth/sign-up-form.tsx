"use client";

import { useActionState } from "react";
import { AlertTriangle, Loader2, MailCheck } from "lucide-react";
import { signUp, type SignUpState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: SignUpState = { ok: false, needsConfirmation: false, error: null };

/**
 * Sign-up form posting to the `signUp` server action. When Supabase email
 * confirmation is on, the action returns `needsConfirmation` and the form
 * swaps to a "check your email" state; with confirmation off, the action
 * redirects to /account and this component never re-renders.
 */
export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, INITIAL_STATE);

  if (state.ok && state.needsConfirmation) {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-card/40 p-5">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-success" />
        <div className="text-sm">
          <p className="font-semibold">Check your email</p>
          <p className="mt-1 text-muted-foreground">
            We sent a confirmation link to your address. Click it to activate your account, then
            sign in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {state.error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <TextField
        label="Display name (optional)"
        name="displayName"
        type="text"
        autoComplete="nickname"
        maxLength={60}
      />
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={72}
        required
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2 className="animate-spin" />}
        Create account
      </Button>
    </form>
  );
}

function TextField({
  label,
  name,
  type,
  autoComplete,
  minLength,
  maxLength,
  required,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        required={required}
        className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}
