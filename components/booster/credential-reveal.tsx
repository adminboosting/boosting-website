"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { revealOrderCredentials } from "@/app/(booster)/booster/orders/[id]/actions";
import { Button } from "@/components/ui/button";

/**
 * Explicit-consent credential reveal for the assigned booster. The server
 * action verifies the active assignment and writes the credential_access_log
 * row BEFORE any plaintext is returned; this component only ever holds the
 * result in React state — never localStorage, never a cookie — and blanks it
 * automatically after 60 seconds. A deployment without the vault key shows
 * the action's "not configured" error verbatim.
 */

const AUTO_HIDE_MS = 60_000;

interface RevealedCredentials {
  username: string;
  password: string;
  note: string | null;
}

export function CredentialReveal({ orderId }: { orderId: string }) {
  const [revealed, setRevealed] = useState<RevealedCredentials | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"username" | "password" | null>(null);

  // Auto-hide: plaintext leaves memory 60s after the reveal, every time.
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(null), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [revealed]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function reveal() {
    setLoading(true);
    setError(null);
    try {
      const result = await revealOrderCredentials(orderId);
      if (result.ok) {
        setRevealed({ username: result.username, password: result.password, note: result.note });
      } else {
        setError(result.error);
      }
    } catch {
      setError("Couldn't reveal credentials — try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(field: "username" | "password", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
    } catch {
      // Clipboard can be unavailable (permissions, http) — the value is on
      // screen either way.
    }
  }

  if (!revealed) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card/40 p-5">
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>Every reveal is logged with your account and IP.</span>
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        <Button type="button" size="sm" disabled={loading} onClick={() => void reveal()}>
          {loading ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Reveal login
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/40 p-5">
      <dl className="space-y-2">
        <CredentialRow
          label="Username"
          value={revealed.username}
          copied={copied === "username"}
          onCopy={() => void copy("username", revealed.username)}
        />
        <CredentialRow
          label="Password"
          value={revealed.password}
          copied={copied === "password"}
          onCopy={() => void copy("password", revealed.password)}
        />
      </dl>
      {revealed.note && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Customer note:</span> {revealed.note}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" onClick={() => setRevealed(null)}>
          Hide now
        </Button>
        <p className="text-xs text-muted-foreground">
          Hides automatically after {AUTO_HIDE_MS / 1000} seconds. Never stored on this device.
        </p>
      </div>
    </div>
  );
}

function CredentialRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="truncate font-mono text-sm">{value}</dd>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
        onClick={onCopy}
      >
        {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
    </div>
  );
}
