import type { Metadata } from "next";
import { Star } from "lucide-react";
import { getServiceByType } from "@/lib/catalog/content";
import { getGames } from "@/lib/catalog/source";
import { BRAND_NAME, getSiteUrl } from "@/lib/config";
import { getPublishedReviews, type PublicReview } from "@/lib/reviews/public";

export const metadata: Metadata = {
  title: "Reviews",
  description: `Customer reviews of ${BRAND_NAME} boosting — moderated and published from completed orders.`,
  alternates: { canonical: `${getSiteUrl()}/reviews` },
};

/**
 * Published reviews go live within five minutes of an admin flipping them in
 * /admin/reviews (the moderation action also revalidates this path directly).
 */
export const revalidate = 300;

/*
 * NOTE: We deliberately do NOT emit AggregateRating/Review JSON-LD on our own
 * pages (post-2024 Google guidance discourages self-serving review rich results).
 * Third-party review rich results should come from Trustpilot instead. The
 * sample reviews below render ONLY while no real review has been published,
 * and are labeled as samples on the page — never presented as real customers.
 */
const SAMPLE_REVIEWS = [
  {
    name: "Kaiden",
    game: "League of Legends",
    rating: 5,
    body: "Silver to Gold in two days, booster kept me updated the whole way. Super smooth.",
  },
  {
    name: "Mira",
    game: "Valorant",
    rating: 5,
    body: "Did duo so I could learn — genuinely picked up on my positioning. Worth it.",
  },
  {
    name: "Tobias",
    game: "Overwatch 2",
    rating: 4,
    body: "Fast and clean. Appear-offline gave me peace of mind about my account.",
  },
  {
    name: "Sana",
    game: "Marvel Rivals",
    rating: 5,
    body: "Placements went 9-1. Started the season way higher than last time.",
  },
  {
    name: "Devon",
    game: "League of Legends",
    rating: 5,
    body: "Transparent pricing, no surprises. The cashback credit was a nice touch.",
  },
  {
    name: "Priya",
    game: "Valorant",
    rating: 5,
    body: "Booster was clearly high-level. Hit Diamond faster than the estimate.",
  },
  {
    name: "Marco",
    game: "Overwatch 2",
    rating: 4,
    body: "Good communication and progress screenshots every session.",
  },
  {
    name: "Elise",
    game: "Marvel Rivals",
    rating: 5,
    body: "Easy checkout, quick match with a booster, and I could chat anytime.",
  },
];

/** Server-rendered dates; en-US to match the money formatter. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={
            i < rating ? "size-4 fill-rank-gold text-rank-gold" : "size-4 text-muted-foreground"
          }
        />
      ))}
    </div>
  );
}

export default async function ReviewsPage() {
  const reviews = await getPublishedReviews();

  // Fallback: nothing published yet (or no DB on this deploy). The samples are
  // HONESTLY labeled as samples — the header sentence is the load-bearing copy.
  if (reviews.length === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-12">
        <header className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Customer reviews</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Sample reviews — real customer reviews appear here once published. Every real review
            comes from a completed order and is moderated before it goes live.
          </p>
        </header>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {SAMPLE_REVIEWS.map((r) => (
            <figure
              key={`${r.name}-${r.body}`}
              className="rounded-xl border border-border bg-card/50 p-6"
            >
              <Stars rating={r.rating} />
              <blockquote className="mt-3 text-sm leading-relaxed text-muted-foreground">
                &ldquo;{r.body}&rdquo;
              </blockquote>
              <figcaption className="mt-4 text-sm font-medium">
                {r.name} <span className="text-muted-foreground">· {r.game}</span>
              </figcaption>
              <p className="mt-2 text-xs text-muted-foreground">Sample review</p>
            </figure>
          ))}
        </div>
      </div>
    );
  }

  const games = await getGames();
  const gameName = (slug: string | null) =>
    slug ? (games.find((g) => g.slug === slug)?.name ?? slug) : null;

  const purchaseLabel = (review: PublicReview): string => {
    const game = gameName(review.gameSlug);
    const service = review.serviceType ? getServiceByType(review.serviceType).short : null;
    return game && service ? `Verified purchase — ${game} ${service}` : "Verified purchase";
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Customer reviews</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Real, moderated reviews from completed orders. We publish the good and the constructive.
        </p>
      </header>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {reviews.map((review) => (
          <figure key={review.id} className="rounded-xl border border-border bg-card/50 p-6">
            <Stars rating={review.rating} />
            {review.body && (
              <blockquote className="mt-3 text-sm leading-relaxed text-muted-foreground">
                &ldquo;{review.body}&rdquo;
              </blockquote>
            )}
            <figcaption className="mt-4 text-sm font-medium">
              {review.displayName}{" "}
              <span className="text-muted-foreground">
                · {DATE_FORMAT.format(new Date(review.createdAt))}
              </span>
            </figcaption>
            <p className="mt-3 inline-flex items-center rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              {purchaseLabel(review)}
            </p>
          </figure>
        ))}
      </div>
    </div>
  );
}
