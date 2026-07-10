import Link from "next/link";
import { ArrowRight, Coins, Gamepad2, ShieldCheck, Sparkles, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { LilyLadder, tierColorVar } from "@/components/brand/lily-ladder";
import { getGames } from "@/lib/catalog/source";
import { SERVICES } from "@/lib/catalog/content";
import { BRAND_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

// A generic climb for the hero's signature ladder (Bronze → the crowned top).
const HERO_RUNGS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master"].map((tier) => ({
  label: tier,
  colorVar: tierColorVar(tier),
}));

const GAME_ACCENT: Record<string, string> = {
  "league-of-legends": "text-rank-gold",
  valorant: "text-rank-grandmaster",
  "overwatch-2": "text-rank-platinum",
  "marvel-rivals": "text-rank-master",
};

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
      {/* Hero — a thesis rooted in the subject (the ladder/pond), anchored by
          the signature lily-pad climb, not a big-number gradient template. */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute -left-40 top-[-25%] size-[38rem] rounded-full opacity-50 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, color-mix(in oklch, var(--pond) 20%, transparent), transparent 70%)",
            }}
          />
          <div
            className="absolute right-[-12%] top-[8%] size-[26rem] rounded-full opacity-45 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, color-mix(in oklch, var(--crown) 22%, transparent), transparent 70%)",
            }}
          />
        </div>

        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-20 sm:py-24 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-crown-ink" />
              Piloted or duo, priced live
            </span>
            <h1 className="mt-6 max-w-2xl text-balance text-4xl leading-[1.05] font-semibold sm:text-6xl">
              Every rank is a lily pad. <span className="text-primary">We hop you to the top.</span>
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
              {BRAND_NAME} is a first-party boosting service for League of Legends, Valorant,
              Overwatch 2, and Marvel Rivals. Set your climb, see the exact price, and let a vetted
              pro leap you up the ladder.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/games" className={cn(buttonVariants({ size: "lg" }))}>
                See your price
                <ArrowRight />
              </Link>
              <Link
                href="/how-it-works"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                How it works
              </Link>
            </div>

            <ul className="mt-12 grid max-w-lg grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              {[
                { icon: Gamepad2, k: "4 games", v: "at launch" },
                { icon: Users, k: "Piloted + duo", v: "your call" },
                { icon: ShieldCheck, k: "Encrypted", v: "account handling" },
                { icon: Coins, k: "Cashback", v: "every order" },
              ].map(({ icon: Icon, k, v }) => (
                <li key={k} className="flex items-start gap-2.5">
                  <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">{k}</p>
                    <p className="text-xs text-muted-foreground">{v}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* The signature ladder */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="rounded-2xl border border-border bg-card/70 p-7 shadow-lg backdrop-blur-sm sm:p-9">
              <p className="mb-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                The climb
              </p>
              <LilyLadder rungs={HERO_RUNGS} />
            </div>
          </div>
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
