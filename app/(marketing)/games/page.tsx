import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getGames } from "@/lib/catalog/source";
import { SERVICES } from "@/lib/catalog/content";
import { BRAND_NAME, getSiteUrl } from "@/lib/config";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Games we boost — LoL, Valorant, Overwatch 2 & Marvel Rivals",
  description: `Choose your game to configure a boost. ${BRAND_NAME} offers rank boost, placements, and net wins for League of Legends, Valorant, Overwatch 2, and Marvel Rivals.`,
  alternates: { canonical: `${getSiteUrl()}/games` },
};

const GAME_ACCENT: Record<string, string> = {
  "league-of-legends": "text-rank-gold",
  valorant: "text-rank-grandmaster",
  "overwatch-2": "text-rank-platinum",
  "marvel-rivals": "text-rank-master",
};

export default async function GamesPage() {
  const games = await getGames();
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Choose your game</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Configure a boost and see a live, itemized price. Piloted or duo, priced by the division.
        </p>
      </header>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {games.map((game) => (
          <Link
            key={game.slug}
            href={`/${game.slug}`}
            className="group flex items-start gap-4 rounded-xl border border-border bg-card/50 p-6 transition-colors hover:border-primary/50"
          >
            <div
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-lg bg-secondary text-sm font-bold",
                GAME_ACCENT[game.slug],
              )}
            >
              {game.shortName}
            </div>
            <div className="flex-1">
              <h2 className="flex items-center gap-1 font-semibold">
                {game.name}
                <ArrowRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {SERVICES.map((s) => s.name).join(" · ")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
