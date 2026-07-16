import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { requireBooster } from "@/lib/auth/session";
import { getServiceByType } from "@/lib/catalog/content";
import { getGames } from "@/lib/catalog/source";
import type { OrderMode, ServiceType } from "@/lib/catalog/types";
import type { OrderStatus } from "@/lib/orders/transitions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Booster desk",
  description: "Your assigned boost orders.",
  robots: { index: false },
};

/**
 * An order_assignments row with the FK-embedded order, as PostgREST returns it.
 * Both hops pass RLS with the user-scoped client: order_assignments_select
 * (own rows) and orders via can_access_order(). NO money columns — boosters
 * never see customer pricing (earnings come from booster_earnings later).
 */
interface ActiveAssignmentRow {
  id: string;
  order_id: string;
  assigned_at: string;
  orders: {
    id: string;
    game_slug: string;
    service_type: ServiceType;
    mode: OrderMode;
    region_code: string;
    status: OrderStatus;
    eta_hours: number | null;
    created_at: string;
  } | null;
}

/**
 * A released assignment row, assignment columns ONLY. Once is_active flips
 * false, can_access_order() is false too — the booster still sees their own
 * assignment rows (order_assignments_select), but NOT the order, so this
 * section renders from the assignment row alone (no order embed on purpose;
 * an embed would silently come back null).
 */
interface PastAssignmentRow {
  id: string;
  order_id: string;
  assigned_at: string;
  unassigned_at: string | null;
}

/** Server-rendered dates; en-US to match the rest of the site. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function BoosterDashboardPage() {
  // Independent identity check (spec A2 layer 2) — the layout only redirects.
  const session = await requireBooster();
  const { user } = session;

  // User-scoped client throughout: RLS is exercised, never bypassed. The
  // explicit booster_id filter keeps "my assignments" literally mine even for
  // an admin passing requireBooster (admins have no assignment rows anyway).
  const supabase = await createClient();
  const [activeResult, pastResult, games] = await Promise.all([
    supabase
      .from("order_assignments")
      .select(
        "id, order_id, assigned_at, orders (id, game_slug, service_type, mode, region_code, status, eta_hours, created_at)",
      )
      .eq("booster_id", user.id)
      .eq("is_active", true)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("order_assignments")
      .select("id, order_id, assigned_at, unassigned_at")
      .eq("booster_id", user.id)
      .eq("is_active", false)
      .order("unassigned_at", { ascending: false })
      .limit(10),
    getGames(),
  ]);

  const active = (activeResult.data ?? []) as unknown as ActiveAssignmentRow[];
  const past = (pastResult.data ?? []) as PastAssignmentRow[];
  const gameName = (slug: string) => games.find((g) => g.slug === slug)?.name ?? slug;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Booster desk</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Orders assigned to you. Open one to update progress and message the customer.
      </p>

      {active.length === 0 ? (
        <div className="mt-8 rounded-xl border border-border bg-card/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No active assignments — new orders land here when an admin assigns you.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {active.map((assignment) => {
            const order = assignment.orders;
            // A null embed means the order became invisible between the two
            // RLS hops (revocation race) — skip rather than render a shell.
            if (!order) return null;
            const service = getServiceByType(order.service_type);
            return (
              <li key={assignment.id}>
                <Link
                  href={`/booster/orders/${order.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/40 p-5 transition-colors hover:bg-card/70"
                >
                  <div>
                    <p className="font-semibold">
                      {gameName(order.game_slug)} — {service.short}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Assigned {DATE_FORMAT.format(new Date(assignment.assigned_at))} ·{" "}
                      {order.mode === "piloted" ? "Piloted" : "Duo"} ·{" "}
                      {order.region_code.toUpperCase()}
                      {order.eta_hours !== null && <> · est. {order.eta_hours}h</>}
                    </p>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Past assignments</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Released assignments — the order itself is no longer visible to you.
          </p>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card/40">
            {past.map((assignment) => (
              <li
                key={assignment.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground"
              >
                <span>Order #{assignment.order_id.slice(0, 8)}</span>
                <span className="text-xs">
                  {DATE_FORMAT.format(new Date(assignment.assigned_at))}
                  {assignment.unassigned_at && (
                    <> — {DATE_FORMAT.format(new Date(assignment.unassigned_at))}</>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
