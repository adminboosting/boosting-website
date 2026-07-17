import type { ServiceType } from "@/lib/catalog/types";

/**
 * Published-review feed for the public /reviews page.
 *
 * Reviews carry no game/display-name columns of their own, and anon RLS can't
 * read `orders` or `profiles` — so the page's query runs on the SERVICE-ROLE
 * client and rides the FK embeds instead. Because the service role bypasses
 * RLS, the `.eq("is_published", true)` filter below is the ONLY thing keeping
 * unpublished reviews out of the public feed — never remove it.
 *
 * `mapReviewRow` is pure so the fast suite can pin the mapping; the admin
 * client is imported dynamically inside `getPublishedReviews` because
 * lib/supabase/admin.ts pulls in "server-only", which plain-Node Vitest can't
 * resolve (same reason vitest.config.ts blanks the Supabase env).
 */

/** Many-to-one FK embeds as PostgREST returns them (object, or array on older shapes). */
interface ReviewOrderEmbed {
  game_slug: string;
  service_type: ServiceType;
}

interface ReviewProfileEmbed {
  display_name: string | null;
}

/** One row of the /reviews query, as PostgREST returns it (snake_case). */
export interface PublicReviewRow {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  orders: ReviewOrderEmbed | ReviewOrderEmbed[] | null;
  profiles: ReviewProfileEmbed | ReviewProfileEmbed[] | null;
}

/** What the public page renders — no user ids, no emails, first name only. */
export interface PublicReview {
  id: string;
  rating: number;
  /** Trimmed body; empty string when the customer left a rating-only review. */
  body: string;
  createdAt: string;
  gameSlug: string | null;
  serviceType: ServiceType | null;
  /** First name only, or "Verified customer" when no display name is set. */
  displayName: string;
}

/** Shown when a profile has no display name (privacy-preserving default). */
export const ANONYMOUS_REVIEWER = "Verified customer";

/** PostgREST M:1 embeds are objects, but tolerate the array shape too. */
function firstEmbed<T>(embed: T | T[] | null | undefined): T | null {
  if (Array.isArray(embed)) return embed[0] ?? null;
  return embed ?? null;
}

/**
 * Map a raw row to the public shape. Total — never throws on partial rows.
 * Display names truncate to the first whitespace-separated token so full
 * names never end up on a public page.
 */
export function mapReviewRow(row: PublicReviewRow): PublicReview {
  const order = firstEmbed(row.orders);
  const profile = firstEmbed(row.profiles);

  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? "";

  return {
    id: row.id,
    rating: row.rating,
    body: row.body?.trim() ?? "",
    createdAt: row.created_at,
    gameSlug: order?.game_slug ?? null,
    serviceType: order?.service_type ?? null,
    displayName: firstName.length > 0 ? firstName : ANONYMOUS_REVIEWER,
  };
}

/**
 * Newest published reviews, mapped for display. Returns [] on ANY failure —
 * missing service-role env (local static builds, CI), network errors, or a
 * query error — so /reviews degrades to its sample-review fallback instead of
 * failing the build (the page prerenders under `revalidate = 300`).
 */
export async function getPublishedReviews(limit = 24): Promise<PublicReview[]> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("reviews")
      .select(
        "id, rating, body, created_at, orders (game_slug, service_type), profiles (display_name)",
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as unknown as PublicReviewRow[]).map(mapReviewRow);
  } catch {
    return [];
  }
}
