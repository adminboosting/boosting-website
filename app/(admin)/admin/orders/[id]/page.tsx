import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  assignBoosterFromForm,
  cancelOrder,
  markAdminMessagesRead,
  recordManualPayment,
  sendAdminOrderMessage,
  unassignBooster,
} from "@/app/(admin)/admin/orders/actions";
import { AdminActionButton } from "@/components/admin/admin-action-button";
import { ORDER_STATUS_META, OrderStatusBadge } from "@/components/admin/order-status-badge";
import { OrderChat } from "@/components/chat/order-chat";
import { Button } from "@/components/ui/button";
import { summarizeOrder } from "@/lib/ai/order-summary";
import { requireAdmin } from "@/lib/auth/session";
import { getServiceByType } from "@/lib/catalog/content";
import { getGames, getRanks } from "@/lib/catalog/source";
import type { GameSlug, OrderMode, ServiceType } from "@/lib/catalog/types";
import { formatUsdFromCents } from "@/lib/money";
import { canTransition, type OrderStatus } from "@/lib/orders/transitions";
import type { QuoteConfig } from "@/lib/pricing/types";
import type { ChatMessageRow } from "@/lib/realtime/order-chat-channel";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Admin — order",
  description: "Order detail: payments, assignment, chat, and manual actions.",
  robots: { index: false },
};

/** The orders columns this page reads, plus the customer via the user_id FK embed. */
interface AdminOrderDetailRow {
  id: string;
  user_id: string;
  game_slug: string;
  service_type: ServiceType;
  mode: OrderMode;
  region_code: string;
  config: QuoteConfig;
  status: OrderStatus;
  subtotal_cents: number;
  discount_cents: number;
  store_credit_applied_cents: number;
  total_cents: number;
  coupon_code: string | null;
  created_at: string;
  profiles: { email: string | null; display_name: string | null } | null;
}

/** Mirrors the `payment_provider` / `payment_status` enums (0001_foundation.sql). */
type PaymentProvider = "nowpayments" | "stripe_test" | "manual";
type PaymentStatus = "created" | "pending" | "confirmed" | "failed" | "refunded";

interface PaymentRow {
  id: string;
  provider: PaymentProvider;
  provider_ref: string | null;
  amount_cents: number;
  status: PaymentStatus;
  created_at: string;
}

interface ProgressRow {
  id: string;
  status_from: OrderStatus | null;
  status_to: OrderStatus;
  note: string | null;
  created_at: string;
}

/** order_assignments rows with the booster via the booster_id FK embed. */
interface AssignmentRow {
  id: string;
  booster_id: string;
  assigned_at: string;
  unassigned_at: string | null;
  is_active: boolean;
  profiles: { email: string | null; display_name: string | null } | null;
}

/** booster_profiles rows for the assign select, with the 1:1 profiles embed. */
interface BoosterOptionRow {
  id: string;
  display_name: string | null;
  is_accepting: boolean;
  profiles: { email: string | null; display_name: string | null; role: string } | null;
}

const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  manual: "Manual / crypto",
  nowpayments: "NOWPayments",
  stripe_test: "Stripe (test)",
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  created: "Awaiting payment",
  pending: "Payment pending",
  confirmed: "Confirmed",
  failed: "Failed",
  refunded: "Refunded",
};

/**
 * Statuses that may take a booster — mirrors ASSIGNABLE_STATUSES in actions.ts
 * (a "use server" module can only export async functions, so the constant
 * can't be shared). The action re-validates regardless; this only gates UI.
 */
const ASSIGNABLE_STATUSES: readonly OrderStatus[] = ["paid", "assigned", "in_progress", "paused"];

/** Server-rendered dates; en-US to match the money formatter. */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function boosterLabel(assignment: AssignmentRow): string {
  return (
    assignment.profiles?.display_name ??
    assignment.profiles?.email ??
    `#${assignment.booster_id.slice(0, 8)}`
  );
}

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assign_error?: string }>;
}) {
  const { id } = await params;
  const { assign_error: assignErrorRaw } = await searchParams;
  // Independent identity check on top of the layout's — layers hold alone.
  // The session also feeds the chat (currentUserId marks own bubbles).
  const session = await requireAdmin();

  // User-scoped client: admins pass RLS on orders, payments, order_progress,
  // order_assignments, order_messages, and profiles. A malformed id and a
  // missing row both land on notFound().
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, user_id, game_slug, service_type, mode, region_code, config, status, subtotal_cents, discount_cents, store_credit_applied_cents, total_cents, coupon_code, created_at, profiles (email, display_name)",
    )
    .eq("id", id)
    .maybeSingle();
  const order = data as unknown as AdminOrderDetailRow | null;
  if (!order) notFound();

  const [paymentsResult, progressResult, assignmentsResult, messagesResult, games, ranks] =
    await Promise.all([
      supabase
        .from("payments")
        .select("id, provider, provider_ref, amount_cents, status, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("order_progress")
        .select("id, status_from, status_to, note, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("order_assignments")
        .select(
          "id, booster_id, assigned_at, unassigned_at, is_active, profiles (email, display_name)",
        )
        .eq("order_id", order.id)
        .order("assigned_at", { ascending: true }),
      // Last 100 messages, ascending for the chat (fetch newest-first, reverse).
      supabase
        .from("order_messages")
        .select("id, order_id, sender_id, body, is_system, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false })
        .limit(100),
      getGames(),
      // Rank labels for the deterministic summary line ("Gold IV → Plat II").
      getRanks(order.game_slug as GameSlug),
    ]);
  const payments = (paymentsResult.data ?? []) as PaymentRow[];
  const progress = (progressResult.data ?? []) as ProgressRow[];
  const assignments = (assignmentsResult.data ?? []) as unknown as AssignmentRow[];
  const messages = ((messagesResult.data ?? []) as ChatMessageRow[]).slice().reverse();
  const gameName = games.find((g) => g.slug === order.game_slug)?.name ?? order.game_slug;

  // Deterministic one-line summary — AI feature "order_summary"
  // (lib/ai/features.ts); the pure template runs while AI stays off.
  const latestProgress = progress.length > 0 ? progress[progress.length - 1] : null;
  const orderSummary = summarizeOrder(
    {
      gameName,
      serviceType: order.service_type,
      mode: order.mode,
      status: order.status,
      config: order.config,
      totalCents: order.total_cents,
      createdAt: order.created_at,
      ranks,
    },
    latestProgress ? { note: latestProgress.note, createdAt: latestProgress.created_at } : null,
  );

  const activeAssignment = assignments.find((a) => a.is_active) ?? null;
  const pastAssignments = assignments.filter((a) => !a.is_active);
  const serviceRoleReady = isServiceRoleConfigured();

  // Accepting boosters for the assign select — service role, because listing
  // OTHER users' profiles/booster rows isn't a participant read (and the
  // assign write is service-role anyway; see the grant trap in actions.ts).
  let boosterOptions: BoosterOptionRow[] = [];
  if (serviceRoleReady && !activeAssignment && ASSIGNABLE_STATUSES.includes(order.status)) {
    const admin = createAdminClient();
    const { data: boosterData } = await admin
      .from("booster_profiles")
      .select("id, display_name, is_accepting, profiles (email, display_name, role)")
      .eq("is_accepting", true);
    boosterOptions = ((boosterData ?? []) as unknown as BoosterOptionRow[]).filter(
      (b) => b.profiles?.role === "booster",
    );
  }

  const assignError =
    typeof assignErrorRaw === "string" && assignErrorRaw.length > 0
      ? assignErrorRaw.slice(0, 300)
      : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        Order queue
      </Link>

      <header className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Order #{order.id.slice(0, 8)}</h1>
        <OrderStatusBadge status={order.status} />
      </header>

      <p className="mt-2 text-sm text-muted-foreground">{orderSummary}</p>

      <section className="mt-6 rounded-xl border border-border bg-card/40 p-5">
        <h2 className="font-semibold">Summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <SummaryRow
            label="Customer"
            value={order.profiles?.email ?? order.profiles?.display_name ?? order.user_id}
          />
          <SummaryRow
            label="Service"
            value={`${gameName} — ${getServiceByType(order.service_type).short}`}
          />
          <SummaryRow label="Mode" value={order.mode === "piloted" ? "Piloted" : "Duo"} />
          <SummaryRow label="Region" value={order.region_code.toUpperCase()} />
          {order.coupon_code && <SummaryRow label="Coupon" value={order.coupon_code} />}
          <SummaryRow label="Placed" value={DATE_TIME_FORMAT.format(new Date(order.created_at))} />
        </dl>

        <div className="mt-4 border-t border-border pt-4">
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatUsdFromCents(order.subtotal_cents)}</dd>
            </div>
            {order.discount_cents > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Discounts</dt>
                <dd className="tabular-nums text-success">
                  −{formatUsdFromCents(order.discount_cents)}
                </dd>
              </div>
            )}
            {order.store_credit_applied_cents > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Store credit</dt>
                <dd className="tabular-nums text-success">
                  −{formatUsdFromCents(order.store_credit_applied_cents)}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-bold tabular-nums">{formatUsdFromCents(order.total_cents)}</dd>
            </div>
          </dl>
        </div>

        {/* orders.config is the camelCase QuoteConfig persisted verbatim at
            checkout — raw view beats re-deriving labels for admin debugging. */}
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-muted-foreground">Raw config</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs">
            {JSON.stringify(order.config, null, 2)}
          </pre>
        </details>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card/40 p-5">
        <h2 className="font-semibold">Assignment</h2>

        {assignError && (
          <p className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
            {assignError}
          </p>
        )}

        {activeAssignment ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-medium">{boosterLabel(activeAssignment)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Assigned {DATE_TIME_FORMAT.format(new Date(activeAssignment.assigned_at))}
              </p>
            </div>
            {/* Release keeps the order at its current status (no backward
                walk); re-assigning restores coverage. */}
            <AdminActionButton
              action={unassignBooster.bind(null, order.id)}
              label="Unassign booster"
              variant="destructive"
            />
          </div>
        ) : !ASSIGNABLE_STATUSES.includes(order.status) ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {order.status === "pending_payment"
              ? "Confirm the payment first — boosters join once the order is paid."
              : "This order is closed — no booster needed."}
          </p>
        ) : !serviceRoleReady ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Booster assignment needs the service-role key on this deployment.
          </p>
        ) : boosterOptions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No accepting boosters yet — promote one under Boosters.
          </p>
        ) : (
          <form
            action={assignBoosterFromForm.bind(null, order.id)}
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            <select
              name="boosterId"
              required
              defaultValue=""
              aria-label="Booster"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>
                Select a booster…
              </option>
              {boosterOptions.map((booster) => (
                <option key={booster.id} value={booster.id}>
                  {booster.display_name ??
                    booster.profiles?.display_name ??
                    booster.profiles?.email ??
                    booster.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm">
              Assign booster
            </Button>
          </form>
        )}

        {pastAssignments.length > 0 && (
          <ul className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            {pastAssignments.map((assignment) => (
              <li key={assignment.id} className="flex flex-wrap justify-between gap-2">
                <span>{boosterLabel(assignment)}</span>
                <span>
                  {DATE_TIME_FORMAT.format(new Date(assignment.assigned_at))} —{" "}
                  {assignment.unassigned_at
                    ? DATE_TIME_FORMAT.format(new Date(assignment.unassigned_at))
                    : "released"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold tracking-tight">Payments</h2>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No payment rows — checkout normally creates one; this order may need manual repair.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card/40">
            {payments.map((payment) => (
              <li key={payment.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">{PROVIDER_LABELS[payment.provider]}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {DATE_TIME_FORMAT.format(new Date(payment.created_at))}
                      {payment.provider_ref && <> · ref: {payment.provider_ref}</>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium tabular-nums">
                      {formatUsdFromCents(payment.amount_cents)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {PAYMENT_STATUS_LABELS[payment.status]}
                    </p>
                  </div>
                </div>

                {/* Button visibility mirrors PAYMENT_STATUS_WALK in actions.ts
                    (created → pending/confirmed/failed, pending → confirmed/
                    failed); the action re-validates the walk regardless. */}
                {(payment.status === "created" || payment.status === "pending") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {payment.status === "created" && (
                      <AdminActionButton
                        action={recordManualPayment.bind(null, payment.id, "pending")}
                        label="Mark pending"
                        variant="outline"
                      />
                    )}
                    <AdminActionButton
                      action={recordManualPayment.bind(null, payment.id, "confirmed")}
                      label="Confirm payment received"
                      variant="default"
                    />
                    <AdminActionButton
                      action={recordManualPayment.bind(null, payment.id, "failed")}
                      label="Mark failed"
                      variant="destructive"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold tracking-tight">Progress history</h2>
        {progress.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No progress entries yet.</p>
        ) : (
          <ol className="mt-3 divide-y divide-border rounded-xl border border-border bg-card/40">
            {progress.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="text-sm">
                  <p className="font-medium">
                    {row.status_from && <>{ORDER_STATUS_META[row.status_from].label} → </>}
                    {ORDER_STATUS_META[row.status_to].label}
                  </p>
                  {row.note && <p className="mt-0.5 text-xs text-muted-foreground">{row.note}</p>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {DATE_TIME_FORMAT.format(new Date(row.created_at))}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Support happens in-context: admins are chat participants via
          can_access_order (is_admin). The send action inserts USER-scoped so
          order_messages_insert_participants stays the enforcement. Composer
          stays open on terminal orders — refund questions land here. */}
      <section className="mt-6">
        <OrderChat
          orderId={order.id}
          currentUserId={session.user.id}
          initialMessages={messages}
          sendAction={sendAdminOrderMessage.bind(null, order.id)}
          markReadAction={markAdminMessagesRead.bind(null, order.id)}
        />
      </section>

      {canTransition(order.status, "cancelled") && (
        <section className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-5">
          <h2 className="font-semibold">Cancel order</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Stops the order from its current status. Store credit spent at checkout is not refunded
            automatically — adjust the customer&rsquo;s profile if anything is owed.
          </p>
          <div className="mt-3">
            <AdminActionButton
              action={cancelOrder.bind(null, order.id)}
              label="Cancel order"
              variant="destructive"
            />
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
