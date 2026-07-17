"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Tiny client island for the (otherwise server-rendered) referral card: copy
 * `value` to the clipboard with a 2s "copied" confirmation. Same pattern as
 * the credential-reveal copy buttons.
 */
export function CopyLinkButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable (permissions, http) — the link is on
      // screen either way.
    }
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      onClick={() => void copy()}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}
