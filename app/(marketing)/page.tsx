import Link from "next/link";
import { ArrowRight, Coins, Gamepad2, ShieldCheck, Sparkles, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getGames } from "@/lib/catalog/source";
import { SERVICES } from "@/lib/catalog/content";
import { BRAND_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

const GAME_ACCENT: Record<string, string> = {
  "league-of-legends": "text-rank-gold",
  valorant: "text-rank-grandmaster",
  "overwatch-2": "text-rank-platinum",
  "marvel-rivals": "text-rank-master",
};

const HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: "Vetted pros only",
    body: "First-party boosters, encrypted account handling, appear-offline by default.",
  },
  {
    icon: Users,
    title: "Piloted or duo",
    body: "Let a pro climb for you, or play alongside them — your choice, priced live.",
  },
  {
    icon: Coins,
    title: "Crypto-first checkout",
    body: "Pay with crypto, earn cashback store credit and loyalty discounts.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Configure your boost",
    body: "Pick your game, current and desired rank, mode, and options. See a live, itemized price instantly.",
  },
  {
    n: "02",
    title: "Checkout & get matched",
    body: "Pay securely. A vetted booster claims your order and opens a private order chat.",
  },
  {
    n: "03",
    title: "Track to completion",
    body: "Follow live progress and screenshots, chat anytime, and leave a review when you hit your goal.",
  },
] as const;

export default async function HomePage() {
  const games = await getGames();
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent)]"
        />
        <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-accent" />
            Piloted & duo boosting, priced live
          </span>
          <h1 className="mt-6 max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            Leap up the ranks with <span className="text-primary">vetted pros</span>.
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">
            {BRAND_NAME} is a first-party boosting service for League of Legends, Valorant,
            Overwatch 2, and Marvel Rivals. Configure your climb and get a live, transparent price —
            no guesswork, no middlemen.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/games" className={cn(buttonVariants({ size: "lg" }))}>
              Explore boosts
              <ArrowRight />
            </Link>
            <Link
              href="/how-it-works"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              How it works
            </Link>
          </div>

          <dl className="mt-14 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { icon: Gamepad2, k: "4 games", v: "at launch" },
              { icon: Users, k: "Piloted + duo", v: "fulfilment" },
              { icon: ShieldCheck, k: "Encrypted", v: "account handling" },
              { icon: Coins, k: "Cashback", v: "on every order" },
            ].map(({ icon: Icon, k, v }) => (
              <div key={k} className="flex items-center gap-3">
                <Icon className="size-5 text-primary" />
                <div>
                  <dt className="text-sm font-semibold">{k}</dt>
                  <dd className="text-xs text-muted-foreground">{v}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Highlights */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-border bg-card/50 p-6">
              <Icon className="size-6 text-accent" />
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Games */}
      <section id="games" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Launch games</h2>
        <p className="mt-2 text-muted-foreground">
          Rank boosts, placements, and net wins for every title.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {games.map((game) => (
            <Link
              key={game.slug}
              href={`/${game.slug}`}
              className="group rounded-xl border border-border bg-card/50 p-6 transition-colors hover:border-primary/50"
            >
              <div
                className={cn(
                  "grid size-11 place-items-center rounded-lg bg-secondary text-sm font-bold",
                  GAME_ACCENT[game.slug],
                )}
              >
                {game.shortName}
              </div>
              <h3 className="mt-4 flex items-center gap-1 font-semibold">
                {game.name}
                <ArrowRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </h3>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                {SERVICES.map((service) => (
                  <li key={service.slug} className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    {service.name}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="rounded-xl border border-border bg-card/50 p-6">
              <span className="font-mono text-sm text-primary">{step.n}</span>
              <h3 className="mt-3 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Link href="/games" className={cn(buttonVariants({ size: "lg" }))}>
            Start your climb
            <ArrowRight />
          </Link>
        </div>
      </section>
    </>
  );
}
