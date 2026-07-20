"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { motion } from "@/lib/motion";
import {
  subscribeToNotifications,
  type NotificationRow,
} from "@/lib/realtime/notifications-channel";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Site-wide notification receiver. Mounted once in the booster and shop layouts
 * for the signed-in user, it subscribes to that user's Realtime channel (0010)
 * and, on each INSERT, plays a short chime and stacks a dismissible popup —
 * so a booster with any page open hears the customer's ping, and an online
 * customer sees "message from your booster".
 *
 * Delivery is RLS-scoped: the channel only ever receives rows addressed to this
 * user. If the publication isn't applied yet (0010 not run on the live project)
 * the channel just never reaches SUBSCRIBED and nothing fires — there is no
 * per-user polling fallback (a missed live ping isn't worth the free-tier
 * connections; the email path covers the customer, and the chat itself is the
 * booster's source of truth).
 *
 * The chime is synthesized with the Web Audio API — no binary asset to ship,
 * and it stays silent until the user has interacted with the page (browsers
 * suspend AudioContext until a gesture; we resume on the first pointer/key).
 */

/** How long a popup lingers before auto-dismiss. */
const POPUP_TTL_MS = 9_000;
/** Cap the visible stack so a burst can't cover the screen. */
const MAX_VISIBLE = 4;

interface Toast {
  id: string;
  title: string;
  body: string;
  orderId: string | null;
}

interface NotificationListenerProps {
  /** The signed-in user's id — the Realtime filter (recipient_id) key. */
  userId: string;
  /**
   * Route prefix for the "open order" link, since the customer and booster
   * surfaces live at different paths. "/orders" (default) for the shop layout,
   * "/booster/orders" for the booster layout.
   */
  orderHrefBase?: string;
}

export function NotificationListener({
  userId,
  orderHrefBase = "/orders",
}: NotificationListenerProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const audioRef = useRef<AudioContext | null>(null);
  const unlockedRef = useRef(false);

  // Lazily create + resume the AudioContext on the first user gesture. Without
  // this, playChime() is a no-op until interaction (autoplay policy).
  useEffect(() => {
    const unlock = () => {
      unlockedRef.current = true;
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx && !audioRef.current) audioRef.current = new AudioCtx();
      void audioRef.current?.resume();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const playChime = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx || !unlockedRef.current) return;
    // Two quick ascending blips — friendly, not alarming.
    const now = ctx.currentTime;
    for (const [i, freq] of [660, 880].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.13;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    }
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (row: NotificationRow) => {
      const toast: Toast = {
        id: row.id,
        title: row.title,
        body: row.body,
        orderId: row.order_id,
      };
      setToasts((prev) => {
        if (prev.some((t) => t.id === toast.id)) return prev; // de-dupe re-delivery
        return [...prev, toast].slice(-MAX_VISIBLE);
      });
      playChime();
      setTimeout(() => dismiss(toast.id), POPUP_TTL_MS);
    },
    [dismiss, playChime],
  );

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const unsubscribe = subscribeToNotifications(supabase, userId, push, (status) => {
      if (status !== "SUBSCRIBED" && process.env.NODE_ENV !== "production") {
        console.warn(`[notifications] channel not live (${status}); popups disabled.`);
      }
    });
    return unsubscribe;
  }, [userId, push]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2"
    >
      {toasts.map((toast) => {
        const inner = (
          <>
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <Bell className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{toast.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{toast.body}</span>
            </span>
          </>
        );
        return (
          <div
            key={toast.id}
            role="alert"
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-lg",
              motion.messageEnter,
            )}
          >
            {toast.orderId ? (
              <Link
                href={`${orderHrefBase}/${toast.orderId}`}
                className="flex flex-1 items-start gap-3"
              >
                {inner}
              </Link>
            ) : (
              <div className="flex flex-1 items-start gap-3">{inner}</div>
            )}
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
