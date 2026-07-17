"use client";

import { useActionState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { signIn, type SignInState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: SignInState = { error: null };

/**
 * Sign-in form posting to the `signIn` server action. `next` is the sanitized
 * post-login destination the page derived from `?next=` (the action
 * re-sanitizes it — the hidden input is a convenience, not a trust boundary).
 */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signIn, INITIAL_STATE);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next ?? "/account"} />

      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <TextField label="Email" name="email" type="email" autoComplete="email" />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        minLength={8}
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2 className="animate-spin" />}
        Sign in
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
}: {
  label: string;
  name: string;
  type: string;
  autoComplete: string;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        minLength={minLength}
        required
        className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}
