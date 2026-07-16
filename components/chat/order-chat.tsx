"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "@/lib/motion";
import {
  mergeMessage,
  subscribeToOrderMessages,
  type ChatMessageRow,
} from "@/lib/realtime/order-chat-channel";
import { chatMessageSchema } from "@/lib/schemas/chat";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Order chat thread + composer, shared by the customer, booster, and admin
 * order pages. Client-safe imports ONLY (supabase/client, the realtime helper,
 * schemas, ui) — never lib/auth/session.ts, lib/supabase/server.ts/admin.ts,
 * or lib/credentials/* ("server-only" must not leak into this bundle).
 *
 * Transport: one realtime channel per mounted page (free-tier budget),
 * subscribed via lib/realtime/order-chat-channel. RLS filters delivery, so a
 * revoked booster's channel simply goes silent. If the channel never reaches
 * SUBSCRIBED (e.g. migration 0007 not yet applied on the live project), the
 * component degrades to a 15s polling refetch through the same RLS-scoped
 * browser client — chat still works, just slower.
 *
 * Sends are optimistic: a temp row renders immediately (pending style), then
 * `mergeMessage` reconciles it with the action's returned row; the duplicate
 * realtime event for our own message dedupes by id in the same helper.
 */

export interface SendMessageResult {
  ok: boolean;
  error?: string | null;
  message?: ChatMessageRow | null;
}

interface OrderChatProps {
  orderId: string;
  currentUserId: string;
  /** Server-fetched history (last 100, ascending) — RLS already applied. */
  initialMessages: ChatMessageRow[];
  /** Bound server action; re-verifies identity + participation server-side. */
  sendAction: (body: string) => Promise<SendMessageResult>;
  /** Bound server action marking messages read for the CURRENT user (batched). */
  markReadAction?: (messageIds: string[]) => Promise<unknown>;
  /** Terminal orders keep history visible but hide the composer. */
  readOnly?: boolean;
}

const POLL_INTERVAL_MS = 15_000;
/** Pixels from the bottom still counted as "at bottom" for auto-scroll. */
const AT_BOTTOM_SLACK_PX = 48;

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function OrderChat({
  orderId,
  currentUserId,
  initialMessages,
  sendAction,
  markReadAction,
  readOnly = false,
}: OrderChatProps) {
  const [messages, setMessages] = useState<ChatMessageRow[]>(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<boolean | null>(null); // null = connecting

  const listRef = useRef<HTMLOListElement | null>(null);
  const stickToBottomRef = useRef(true);
  /** Ids already sent to markReadAction — never re-mark, never mark twice. */
  const markedReadRef = useRef<Set<string>>(new Set());
  const liveRef = useRef<boolean | null>(null);

  // --- realtime subscription (one channel, torn down on unmount) -----------
  useEffect(() => {
    const supabase = createClient();
    const unsubscribe = subscribeToOrderMessages(
      supabase,
      orderId,
      (incoming) => setMessages((prev) => mergeMessage(prev, incoming)),
      (status) => {
        const ok = status === "SUBSCRIBED";
        liveRef.current = ok;
        setLive(ok);
        if (!ok && process.env.NODE_ENV !== "production") {
          // Deliberately visible in dev: usually means 0007 hasn't been
          // applied (RUNBOOK: verify Database → Publications), or the session
          // token is bad — a silent channel would otherwise look like a bug.
          console.warn(`[order-chat] realtime channel not live (${status}); polling instead.`);
        }
      },
    );

    // Polling fallback: only fires while the channel is not SUBSCRIBED.
    // Same RLS-scoped client, so a revoked booster just gets an empty page
    // (treated as "assignment ended", not an error).
    const poll = setInterval(() => {
      if (liveRef.current === true) return;
      void supabase
        .from("order_messages")
        .select("id, order_id, sender_id, body, is_system, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true })
        .limit(100)
        .then(({ data }) => {
          if (data) {
            setMessages((prev) =>
              (data as ChatMessageRow[]).reduce((acc, row) => mergeMessage(acc, row), prev),
            );
          }
        });
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(poll);
      unsubscribe();
    };
  }, [orderId]);

  // --- read receipts: batched, fire-and-forget, own rows only --------------
  useEffect(() => {
    if (!markReadAction) return;
    const unread = messages
      .filter(
        (m) =>
          !m.id.startsWith("temp-") &&
          m.sender_id !== currentUserId &&
          !markedReadRef.current.has(m.id),
      )
      .map((m) => m.id);
    if (unread.length === 0) return;
    for (const id of unread) markedReadRef.current.add(id);
    // RLS (message_reads_own) only ever writes rows for the caller; failures
    // are non-fatal — the ids will simply read as unread again on next load.
    void markReadAction(unread).catch(() => undefined);
  }, [messages, markReadAction, currentUserId]);

  // --- auto-scroll only when the viewer is already at the bottom -----------
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_SLACK_PX;
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // --- optimistic send ------------------------------------------------------
  const send = useCallback(async () => {
    const parsed = chatMessageSchema.safeParse({ body });
    if (!parsed.success) {
      setError("Messages must be 1–2000 characters.");
      return;
    }
    const text = parsed.data.body;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const temp: ChatMessageRow = {
      id: tempId,
      order_id: orderId,
      sender_id: currentUserId,
      body: text,
      is_system: false,
      created_at: new Date().toISOString(),
    };

    setError(null);
    setSending(true);
    setBody("");
    stickToBottomRef.current = true;
    setMessages((prev) => mergeMessage(prev, temp));

    try {
      const result = await sendAction(text);
      if (result.ok && result.message) {
        const message = result.message;
        setMessages((prev) => mergeMessage(prev, message, tempId));
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setBody(text); // give the draft back
        setError(result.error ?? "Message could not be sent.");
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setBody(text);
      setError("Message could not be sent.");
    } finally {
      setSending(false);
    }
  }, [body, currentUserId, orderId, sendAction]);

  return (
    <div className="rounded-xl border border-border bg-card/40">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="font-semibold">Messages</h2>
        {live === false && (
          <span className="text-xs text-muted-foreground">
            Live updates unavailable — refreshing every {POLL_INTERVAL_MS / 1000}s
          </span>
        )}
      </div>

      <ol
        ref={listRef}
        onScroll={handleScroll}
        aria-label="Order messages"
        className="max-h-96 space-y-3 overflow-y-auto p-5"
      >
        {messages.length === 0 && (
          <li className="text-center text-sm text-muted-foreground">
            No messages yet — questions about this order go here.
          </li>
        )}
        {messages.map((message) => {
          if (message.is_system) {
            return (
              <li key={message.id} className="text-center text-xs text-muted-foreground">
                {message.body}
              </li>
            );
          }
          const own = message.sender_id === currentUserId;
          const pending = message.id.startsWith("temp-");
          return (
            <li
              key={message.id}
              className={cn(motion.messageEnter, "flex", own ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg border px-3 py-2 text-sm",
                  own ? "border-primary/40 bg-primary/10" : "border-border bg-muted/40",
                  pending && "opacity-60",
                )}
              >
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <p className="mt-1 text-right text-[10px] text-muted-foreground">
                  {pending ? "Sending…" : TIME_FORMAT.format(new Date(message.created_at))}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {readOnly ? (
        <p className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
          This order is closed — the conversation is read-only.
        </p>
      ) : (
        <form
          className="border-t border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!sending) void send();
          }}
        >
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter inserts a newline.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!sending) void send();
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder="Write a message…"
              aria-label="Message"
              className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              type="submit"
              size="icon"
              disabled={sending || body.trim().length === 0}
              aria-label="Send message"
            >
              {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
