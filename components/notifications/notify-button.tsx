"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Result of a "notify the other party" server action, shared by the customer
 * ("Notify booster") and booster ("Notify customer") surfaces — the same
 * pattern as SendMessageResult living in components/chat/order-chat.tsx and
 * being imported by both action files.
 */
export interface NotifyResult {
  ok: boolean;
  /** True when a live in-app ping was actually delivered (vs. cooldown/degraded). */
  delivered?: boolean;
  error?: string | null;
}

interface NotifyButtonProps {
  /** Bound server action; re-verifies identity + participation server-side. */
  action: () => Promise<NotifyResult>;
  /** Resting label, e.g. "Notify booster". */
  label: string;
  /** Confirmation label shown briefly after a successful send. */
  sentLabel: string;
  /** One-line helper under the button. */
  hint?: string;
  className?: string;
}

/** How long the button stays disabled + "sent" after a successful notify. */
const COOLDOWN_MS = 30_000;

/**
 * A single-purpose notify button with an optimistic cooldown: on success it
 * flips to a confirmation state and disables for COOLDOWN_MS so the sender
 * can't hammer it (the server also enforces its own cooldown). Errors surface
 * inline and re-enable immediately.
 */
export function NotifyButton({ action, label, sentLabel, hint, className }: NotifyButtonProps) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => (timerRef.current ? clearTimeout(timerRef.current) : undefined), []);

  const onClick = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const result = await action();
      if (result.ok) {
        setSent(true);
        timerRef.current = setTimeout(() => setSent(false), COOLDOWN_MS);
      } else {
        setError(result.error ?? "Couldn't send — try again.");
      }
    } catch {
      setError("Couldn't send — try again.");
    } finally {
      setSending(false);
    }
  }, [action]);

  return (
    <div className={cn("space-y-1.5", className)}>
      <Button
        type="button"
        variant={sent ? "secondary" : "default"}
        onClick={() => void onClick()}
        disabled={sending || sent}
        aria-live="polite"
      >
        {sending ? (
          <Loader2 className="animate-spin" />
        ) : sent ? (
          <Check />
        ) : (
          <Bell />
        )}
        {sent ? sentLabel : label}
      </Button>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
