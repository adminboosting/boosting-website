import type { OrderStatus } from "@/lib/orders/transitions";

/**
 * Deterministic chat quick replies — AI feature "chat_quick_replies"
 * (lib/ai/features.ts). Pure canned strings, no env, fast-suite tested.
 *
 * DELIBERATELY NOT WIRED into the chat composer this phase (Phase 4 cut list:
 * editing the realtime composer in the final polish phase risks regressing
 * Phase 3's most fragile surface). Wiring later is a one-component change:
 * render these as tap-to-fill chips above the composer.
 */

/** Which side of the order chat is composing. */
export type QuickReplyRole = "customer" | "booster" | "admin";

/**
 * Canned replies per (status, role). Exhaustive over OrderStatus so a new
 * status can't ship without replies. Strings stay generic enough to be true
 * for every game/service — no placeholders to interpolate.
 */
const QUICK_REPLIES: Record<OrderStatus, Record<QuickReplyRole, readonly string[]>> = {
  pending_payment: {
    customer: [
      "I've sent the payment — can you confirm it on your side?",
      "Which crypto coins do you accept?",
      "Can I pay part of this with store credit?",
    ],
    booster: ["I'll be ready to start as soon as the payment is confirmed."],
    admin: [
      "We haven't received your payment yet — tell me if you need help paying.",
      "Payment received — confirming it now, your order will move to paid shortly.",
    ],
  },
  paid: {
    customer: ["When will a booster be assigned?", "Quick note on my schedule before you start:"],
    booster: ["I've picked up your order — introductions shortly."],
    admin: [
      "Payment confirmed — we're assigning a booster now.",
      "Your booster will introduce themselves here once assigned.",
    ],
  },
  assigned: {
    customer: [
      "Hi! When are you planning to start?",
      "Anything you need from me before you begin?",
    ],
    booster: [
      "Hi, I'm your booster — I'll start on your order shortly.",
      "Any schedule preferences or games you'd like me to avoid?",
    ],
    admin: ["Your booster is assigned — they'll coordinate the start here."],
  },
  in_progress: {
    customer: [
      "How is the order going?",
      "What's the ETA from here?",
      "Please keep appear-offline on. Thanks!",
    ],
    booster: [
      "Progress update: climbing steadily — I'll post details after this session.",
      "Good session today — rank moved up, more games tonight.",
      "Taking a short break, back on your order soon.",
    ],
    admin: ["Checking in — the order is in progress and on track."],
  },
  paused: {
    customer: ["When can you resume?", "Is anything blocking the order on my side?"],
    booster: [
      "Order paused for now — I'll message here before resuming.",
      "Resuming your order shortly.",
    ],
    admin: ["The order is paused — tell us if you'd like it resumed or adjusted."],
  },
  completed: {
    customer: ["Thanks — everything looks great!", "How do I leave a review?"],
    booster: [
      "All done — target reached. Thanks for the order, and GLHF!",
      "Order complete — a review is always appreciated.",
    ],
    admin: [
      "Order complete — cashback has been applied to your account after payment confirmation.",
      "Thanks for ordering with us — you can leave a review from your order page.",
    ],
  },
  cancelled: {
    customer: ["Can you help me with a refund?", "Why was this order cancelled?"],
    booster: ["This order was closed — support here can help with anything else."],
    admin: ["This order was cancelled — reply here and we'll sort out any refund owed."],
  },
  refunded: {
    customer: ["Thanks for sorting the refund.", "How long until the refund arrives?"],
    booster: ["This order was refunded and closed — support can take it from here."],
    admin: ["Your refund has been processed — allow a little time for it to land."],
  },
};

/** Canned quick replies for a chat participant on an order in `status`. */
export function getQuickReplies(status: OrderStatus, role: QuickReplyRole): readonly string[] {
  return QUICK_REPLIES[status][role];
}
