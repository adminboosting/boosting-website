"use server";

import { revalidatePath } from "next/cache";
import type { AdminActionState } from "@/app/(admin)/admin/orders/actions";
import { requireAdmin } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/schemas/admin-ops";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";

/**
 * Review moderation. Publishing is the ONE review write customers can never
 * perform (0007's WITH CHECK pins `is_published` to admins), and this surface
 * goes through the service role like the other admin mutations — coupons stays
 * the deliberate user-scoped RLS proof, not this. The proxy only redirects;
 * this action re-verifies the admin role itself (layers hold alone).
 */

/**
 * Publish or unpublish a review. Unpublishing is the takedown path — the
 * public page stops rendering the row on its next revalidate (both paths are
 * revalidated here, so in practice immediately).
 */
export async function setReviewPublished(
  reviewId: string,
  published: boolean,
): Promise<AdminActionState> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  const session = await requireAdmin();

  if (!isServiceRoleConfigured()) {
    return { ok: false, error: "Reviews can't be moderated on this deployment yet." };
  }

  // Bound args arrive from the network, same as form data — validate both.
  if (!uuidSchema.safeParse(reviewId).success) {
    return { ok: false, error: "Unknown review." };
  }
  if (typeof published !== "boolean") {
    return { ok: false, error: "Unknown review state." };
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("reviews")
    .update({ is_published: published })
    .eq("id", reviewId)
    .select("id");
  if (error || !updated || updated.length === 0) {
    return { ok: false, error: "Review not found — refresh and try again." };
  }

  // Best-effort audit trail; the moderation call stands even if this fails.
  await admin.from("audit_log").insert({
    actor_id: session.user.id,
    action: published ? "review.published" : "review.unpublished",
    entity: "reviews",
    entity_id: reviewId,
    meta: { published },
  });

  revalidatePath("/reviews");
  revalidatePath("/admin/reviews");
  return { ok: true, error: null };
}
