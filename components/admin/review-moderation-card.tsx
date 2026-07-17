import Link from "next/link";
import { Star } from "lucide-react";
import { setReviewPublished } from "@/app/(admin)/admin/reviews/actions";
import { AdminActionButton } from "@/components/admin/admin-action-button";
import { getReviewModerationFlags } from "@/lib/ai/moderation";
import { getServiceByType } from "@/lib/catalog/content";
import type { ServiceType } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

/** One reviews row for moderation, as PostgREST returns it with its embeds. */
export interface AdminReviewRow {
  id: string;
  order_id: string;
  rating: number;
  body: string | null;
  is_published: boolean;
  created_at: string;
  orders: { game_slug: string; service_type: ServiceType } | null;
  profiles: { display_name: string | null; email: string | null } | null;
}

/** Server-rendered dates; en-US to match the money formatter. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/**
 * One review in the moderation queue: full body, author, order link, the
 * deterministic moderation flags (lib/ai/moderation.ts — assist, not
 * autopilot: flags inform the admin, they never block the button), and the
 * publish/unpublish action. Server component; the button's bound server
 * action re-verifies the admin role itself.
 */
export function ReviewModerationCard({
  review,
  gameName,
}: {
  review: AdminReviewRow;
  gameName: string;
}) {
  const flags = getReviewModerationFlags(review.body ?? "", review.rating);
  const serviceShort = review.orders ? getServiceByType(review.orders.service_type).short : "—";
  const author = review.profiles?.display_name ?? review.profiles?.email ?? "—";

  return (
    <article className="rounded-xl border border-border bg-card/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1" aria-label={`${review.rating} out of 5 stars`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={
                  i < review.rating
                    ? "size-4 fill-rank-gold text-rank-gold"
                    : "size-4 text-muted-foreground"
                }
              />
            ))}
          </div>
          <p className="mt-2 text-sm font-medium">
            {author}{" "}
            <span className="text-muted-foreground">
              · {gameName} — {serviceShort} ·{" "}
              <Link
                href={`/admin/orders/${review.order_id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                #{review.order_id.slice(0, 8)}
              </Link>{" "}
              · {DATE_FORMAT.format(new Date(review.created_at))}
            </span>
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            review.is_published
              ? "border-success/40 bg-success/10 text-success"
              : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          {review.is_published ? "Published" : "Pending"}
        </span>
      </div>

      {review.body ? (
        <blockquote className="mt-3 text-sm leading-relaxed text-muted-foreground">
          &ldquo;{review.body}&rdquo;
        </blockquote>
      ) : (
        <p className="mt-3 text-sm italic text-muted-foreground">
          Rating only — no written review.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {flags.length === 0 ? (
            <span className="text-xs text-muted-foreground">No moderation flags</span>
          ) : (
            flags.map((flag) => (
              <span
                key={flag}
                className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning"
              >
                {flag}
              </span>
            ))
          )}
        </div>
        <AdminActionButton
          action={setReviewPublished.bind(null, review.id, !review.is_published)}
          label={review.is_published ? "Unpublish" : "Publish"}
          variant={review.is_published ? "destructive" : "default"}
        />
      </div>
    </article>
  );
}
