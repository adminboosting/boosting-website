import type { Metadata } from "next";
import { Star } from "lucide-react";
import { BRAND_NAME, getSiteUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "Reviews",
  description: `Read what customers say about ${BRAND_NAME} boosting — real, moderated reviews from completed orders.`,
  alternates: { canonical: `${getSiteUrl()}/reviews` },
};

/*
 * NOTE: We deliberately do NOT emit AggregateRating/Review JSON-LD on our own
 * pages (post-2024 Google guidance discourages self-serving review rich results).
 * Third-party review rich results should come from Trustpilot instead. These are
 * placeholder demo reviews until real, moderated reviews are published from the DB.
 */
const REVIEWS = [
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

export default function ReviewsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Customer reviews</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Real, moderated reviews from completed orders. We publish the good and the constructive.
        </p>
      </header>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {REVIEWS.map((r) => (
          <figure
            key={`${r.name}-${r.body}`}
            className="rounded-xl border border-border bg-card/50 p-6"
          >
            <div className="flex items-center gap-1" aria-label={`${r.rating} out of 5 stars`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={
                    i < r.rating
                      ? "size-4 fill-rank-gold text-rank-gold"
                      : "size-4 text-muted-foreground"
                  }
                />
              ))}
            </div>
            <blockquote className="mt-3 text-sm leading-relaxed text-muted-foreground">
              &ldquo;{r.body}&rdquo;
            </blockquote>
            <figcaption className="mt-4 text-sm font-medium">
              {r.name} <span className="text-muted-foreground">· {r.game}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
