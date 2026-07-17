import type { Metadata } from "next";
import {
  ReviewModerationCard,
  type AdminReviewRow,
} from "@/components/admin/review-moderation-card";
import { requireAdmin } from "@/lib/auth/session";
import { getGames } from "@/lib/catalog/source";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Admin — reviews",
  description: "Review moderation queue: publish or unpublish customer reviews.",
  robots: { index: false },
};

/**
 * Moderation queue — pending reviews first, newest first within each group.
 * Reads use the service role: unpublished reviews are visible to admins under
 * RLS, but the orders/profiles embeds this page renders are not covered by an
 * anon-facing policy, and every write on this surface is service-role anyway
 * (see actions.ts). requireAdmin() is the gate, independent of the layout's.
 */
export default async function AdminReviewsPage() {
  // Independent identity check on top of the layout's — layers hold alone.
  await requireAdmin();

  if (!isServiceRoleConfigured()) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Reviews</h1>
        <div className="mt-6 rounded-xl border border-border bg-card/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Reviews can&apos;t be moderated on this deployment yet — the service-role key is not
            configured.
          </p>
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("reviews")
    .select(
      "id, order_id, rating, body, is_published, created_at, orders (game_slug, service_type), profiles (display_name, email)",
    )
    .order("is_published", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);
  const reviews = (data ?? []) as unknown as AdminReviewRow[];
  const pendingCount = reviews.filter((r) => !r.is_published).length;

  const games = await getGames();
  const gameName = (slug: string | undefined) =>
    (slug && games.find((g) => g.slug === slug)?.name) || (slug ?? "—");

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Reviews</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {pendingCount === 0
          ? "No reviews waiting for moderation."
          : `${pendingCount} review${pendingCount === 1 ? "" : "s"} waiting for moderation.`}{" "}
        Publishing puts a review on the public /reviews page within five minutes; flags are
        deterministic hints, not verdicts — read the review yourself.
      </p>

      {reviews.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-card/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No reviews yet. Customers can review an order once it&apos;s completed.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {reviews.map((review) => (
            <ReviewModerationCard
              key={review.id}
              review={review}
              gameName={gameName(review.orders?.game_slug)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
