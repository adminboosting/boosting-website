import type { Metadata } from "next";
import { demoteBooster } from "@/app/(admin)/admin/boosters/actions";
import { PromoteBoosterForm } from "@/app/(admin)/admin/boosters/promote-form";
import { AdminActionButton } from "@/components/admin/admin-action-button";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin — boosters",
  description: "Booster roster: promote, demote, and availability.",
  robots: { index: false },
};

/** Booster profiles rows with the 1:1 booster_profiles embed. */
interface BoosterListRow {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  booster_profiles: {
    display_name: string | null;
    is_accepting: boolean;
    rating_avg: number;
    orders_completed: number;
    cut_bp: number;
  } | null;
}

/** Server-rendered dates; en-US to match the money formatter. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function AdminBoostersPage() {
  // Independent identity check on top of the layout's — layers hold alone.
  await requireAdmin();

  // Listing every booster's profile is a cross-user read, and both mutations
  // (role flip, booster_profiles upsert) are service-role only — so this page
  // degrades as a unit when the key is missing rather than half-working.
  if (!isServiceRoleConfigured()) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Boosters</h1>
        <div className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-5 text-sm">
          Booster management needs <code>SUPABASE_SERVICE_ROLE_KEY</code> on this deployment — see
          RUNBOOK.md.
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select(
      "id, email, display_name, created_at, booster_profiles (display_name, is_accepting, rating_avg, orders_completed, cut_bp)",
    )
    .eq("role", "booster")
    .order("created_at", { ascending: true });
  const boosters = (data ?? []) as unknown as BoosterListRow[];

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Boosters</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Who can take orders. Promote an existing account below; assign boosters to orders from the
        order page.
      </p>

      <section className="mt-6 rounded-xl border border-border bg-card/40 p-5">
        <h2 className="font-semibold">Promote a user</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The account must already exist (they sign up like any customer first).
        </p>
        <div className="mt-3">
          <PromoteBoosterForm />
        </div>
      </section>

      {boosters.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-card/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">No boosters yet.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Booster</th>
                <th className="px-4 py-3 font-medium">Accepting</th>
                <th className="px-4 py-3 text-right font-medium">Completed</th>
                <th className="px-4 py-3 text-right font-medium">Rating</th>
                <th className="px-4 py-3 text-right font-medium">Cut</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {boosters.map((booster) => {
                const meta = booster.booster_profiles;
                return (
                  <tr key={booster.id} className="transition-colors hover:bg-card/70">
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {meta?.display_name ?? booster.display_name ?? booster.email ?? booster.id}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {booster.email ?? `#${booster.id.slice(0, 8)}`} · since{" "}
                        {DATE_FORMAT.format(new Date(booster.created_at))}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                          meta?.is_accepting
                            ? "border-success/40 bg-success/10 text-success"
                            : "border-border bg-muted/40 text-muted-foreground",
                        )}
                      >
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                        {meta?.is_accepting ? "Accepting" : "Paused"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {meta?.orders_completed ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {meta && meta.rating_avg > 0 ? meta.rating_avg.toFixed(1) : "—"}
                    </td>
                    {/* cut_bp is basis points of the order total (7000 = 70%). */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {meta ? `${(meta.cut_bp / 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <AdminActionButton
                        action={demoteBooster.bind(null, booster.id)}
                        label="Demote"
                        variant="outline"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
