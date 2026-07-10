import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight } from "lucide-react";
import {
  getGame,
  getGames,
  getNetWinGroups,
  getPlacementPrices,
  getRanks,
} from "@/lib/catalog/source";
import { SERVICES, getServiceByType } from "@/lib/catalog/content";
import type { GameSlug, ServiceType } from "@/lib/catalog/types";
import { getSiteUrl } from "@/lib/config";
import { formatUsdFromCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export const revalidate = 3600;

export async function generateStaticParams() {
  return (await getGames()).map((g) => ({ game: g.slug }));
}

async function resolveGame(slug: string): Promise<GameSlug | null> {
  return (await getGames()).find((g) => g.slug === slug)?.slug ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ game: string }>;
}): Promise<Metadata> {
  const slug = await resolveGame((await params).game);
  if (!slug) return {};
  const game = await getGame(slug);
  const title = `${game.name} Boosting — Rank Boost, Placements & Net Wins`;
  const description = `Safe, fast ${game.name} boosting by vetted pros. Rank boost, placement matches, and ranked net wins — piloted or duo, priced live with encrypted account handling.`;
  return {
    title,
    description,
    alternates: { canonical: `${getSiteUrl()}/${slug}` },
    openGraph: { title, description, url: `${getSiteUrl()}/${slug}`, type: "website" },
  };
}

async function serviceFromCents(gameSlug: GameSlug, type: ServiceType): Promise<number> {
  if (type === "placements") {
    return Math.min(...(await getPlacementPrices(gameSlug)).map((p) => p.pricePerGameCents));
  }
  if (type === "net_wins") {
    return Math.min(...(await getNetWinGroups(gameSlug)).map((g) => g.pricePerWinCents));
  }
  return Math.min(
    ...(await getRanks(gameSlug))
      .filter((r) => r.isPurchasable && r.climbPriceCents > 0)
      .map((r) => r.climbPriceCents),
  );
}

const TIER_COLOR: Record<string, string> = {
  Iron: "bg-rank-iron/20 text-rank-iron",
  Bronze: "bg-rank-bronze/20 text-rank-bronze",
  Silver: "bg-rank-silver/20 text-rank-silver",
  Gold: "bg-rank-gold/20 text-rank-gold",
  Platinum: "bg-rank-platinum/20 text-rank-platinum",
  Emerald: "bg-rank-emerald/20 text-rank-emerald",
  Diamond: "bg-rank-diamond/20 text-rank-diamond",
  Master: "bg-rank-master/20 text-rank-master",
  Grandmaster: "bg-rank-grandmaster/20 text-rank-grandmaster",
  Ascendant: "bg-rank-emerald/20 text-rank-emerald",
  Celestial: "bg-rank-celestial/20 text-rank-celestial",
};

export default async function GameHubPage({ params }: { params: Promise<{ game: string }> }) {
  const slug = await resolveGame((await params).game);
  if (!slug) notFound();
  const [game, ranks, fromEntries] = await Promise.all([
    getGame(slug),
    getRanks(slug),
    Promise.all(SERVICES.map(async (s) => [s.type, await serviceFromCents(slug, s.type)] as const)),
  ]);
  const fromByType = new Map(fromEntries);

  // Unique tiers in ladder order for a visual preview.
  const tiers: string[] = [];
  for (const rank of ranks) {
    if (!tiers.includes(rank.tier)) tiers.push(rank.tier);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="size-3.5" />
        <Link href="/games" className="hover:text-foreground">
          Games
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{game.name}</span>
      </nav>

      <header className="mt-6 max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{game.name} Boosting</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Vetted pros, encrypted account handling, and live progress tracking. Pick a service to
          configure your order and see a transparent price.
        </p>
      </header>

      {/* Services */}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {SERVICES.map((service) => {
          const from = fromByType.get(service.type)!;
          const unit =
            service.type === "rank_boost"
              ? "per division"
              : service.type === "placements"
                ? "per game"
                : "per win";
          return (
            <Link
              key={service.slug}
              href={`/${slug}/${service.slug}`}
              className="group flex flex-col rounded-xl border border-border bg-card/50 p-6 transition-colors hover:border-primary/50"
            >
              <h2 className="flex items-center gap-1 font-semibold">
                {service.name}
                <ArrowRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{service.blurb}</p>
              <p className="mt-4 text-sm">
                <span className="text-muted-foreground">From </span>
                <span className="font-semibold">{formatUsdFromCents(from)}</span>
                <span className="text-muted-foreground"> {unit}</span>
              </p>
            </Link>
          );
        })}
      </div>

      {/* Ladder preview */}
      <section className="mt-14">
        <h2 className="text-xl font-bold tracking-tight">The {game.name} ladder</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {game.divisionsPerTier} divisions per tier. We boost every purchasable rank; the top ranks
          are available as a custom quote.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {tiers.map((tier) => (
            <span
              key={tier}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                TIER_COLOR[tier] ?? "bg-secondary text-muted-foreground",
              )}
            >
              {tier}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
