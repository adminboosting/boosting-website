import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Coins, Gauge, ShieldCheck, Users } from "lucide-react";
import { Calculator, type CalculatorCatalog } from "@/components/calculator/calculator";
import {
  getGame,
  getGames,
  getModifiers,
  getNetWinGroups,
  getPlacementPrices,
  getPricingSettings,
  getRanks,
  getRegions,
} from "@/lib/catalog/source";
import {
  allMoneyPagePaths,
  getMoneyPageContent,
  getServiceBySlug,
} from "@/lib/catalog/content";
import type { GameSlug, ServiceType } from "@/lib/catalog/types";
import { getSiteUrl } from "@/lib/config";
import { formatUsdFromCents } from "@/lib/money";

export const revalidate = 3600;

export function generateStaticParams() {
  return allMoneyPagePaths();
}

type PageParams = { game: string; service: string };

function resolve(params: PageParams): { gameSlug: GameSlug; serviceType: ServiceType } | null {
  const game = getGames().find((g) => g.slug === params.game);
  const service = getServiceBySlug(params.service);
  if (!game || !service) return null;
  return { gameSlug: game.slug, serviceType: service.type };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const resolved = resolve(await params);
  if (!resolved) return {};
  const content = getMoneyPageContent(resolved.gameSlug, resolved.serviceType);
  const url = `${getSiteUrl()}/${resolved.gameSlug}/${(await params).service}`;
  return {
    title: content.metaTitle,
    description: content.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: content.metaTitle,
      description: content.metaDescription,
      url,
      type: "website",
    },
  };
}

function lowestPriceCents(gameSlug: GameSlug, serviceType: ServiceType): number {
  if (serviceType === "placements") {
    return Math.min(...getPlacementPrices(gameSlug).map((p) => p.pricePerGameCents));
  }
  if (serviceType === "net_wins") {
    return Math.min(...getNetWinGroups(gameSlug).map((g) => g.pricePerWinCents));
  }
  return Math.min(
    ...getRanks(gameSlug)
      .filter((r) => r.isPurchasable && r.climbPriceCents > 0)
      .map((r) => r.climbPriceCents),
  );
}

function buildCatalog(gameSlug: GameSlug, serviceType: ServiceType): CalculatorCatalog {
  const settings = getPricingSettings();
  return {
    gameSlug,
    serviceType,
    isLoL: gameSlug === "league-of-legends",
    duoMultiplierBp: settings.duoMultiplierBp,
    volumeDiscounts: settings.volumeDiscounts,
    ranks: getRanks(gameSlug).map((r) => ({
      sortIndex: r.sortIndex,
      label: r.label,
      tier: r.tier,
      isPurchasable: r.isPurchasable,
    })),
    regions: getRegions(gameSlug).map((r) => ({
      code: r.code,
      label: r.label,
      isDefault: r.isDefault,
    })),
    modifiers: getModifiers()
      .filter(
        (m) =>
          m.isActive &&
          (m.gameSlug === null || m.gameSlug === gameSlug) &&
          (m.serviceType === null || m.serviceType === serviceType),
      )
      .map((m) => ({
        key: m.key,
        label: m.label,
        description: m.description,
        kind: m.kind,
        amount: m.amount,
        isDefaultOn: m.isDefaultOn,
        hiddenInDuo: m.hiddenInDuo,
      })),
    placementBands: getPlacementPrices(gameSlug).map((p) => ({
      band: p.band,
      label: p.label,
      minGames: p.minGames,
      maxGames: p.maxGames,
    })),
  };
}

const TRUST = [
  { icon: ShieldCheck, label: "100% manual play" },
  { icon: Users, label: "8+ active boosters" },
  { icon: Coins, label: "Cashback on every order" },
  { icon: Gauge, label: "Live progress tracking" },
];

export default async function MoneyPage({ params }: { params: Promise<PageParams> }) {
  const raw = await params;
  const resolved = resolve(raw);
  if (!resolved) notFound();

  const { gameSlug, serviceType } = resolved;
  const game = getGame(gameSlug);
  const content = getMoneyPageContent(gameSlug, serviceType);
  const service = getServiceBySlug(raw.service)!;
  const catalog = buildCatalog(gameSlug, serviceType);
  const siteUrl = getSiteUrl();
  const low = lowestPriceCents(gameSlug, serviceType);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: game.name, item: `${siteUrl}/${gameSlug}` },
        {
          "@type": "ListItem",
          position: 3,
          name: service.name,
          item: `${siteUrl}/${gameSlug}/${service.slug}`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: content.title,
      description: content.metaDescription,
      brand: { "@type": "Brand", name: game.name },
      offers: {
        "@type": "Offer",
        priceCurrency: "USD",
        lowPrice: (low / 100).toFixed(2),
        price: (low / 100).toFixed(2),
        availability: "https://schema.org/InStock",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: content.faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <ChevronRight className="size-3.5" />
          <Link href={`/${gameSlug}`} className="hover:text-foreground">
            {game.name}
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground">{service.name}</span>
        </nav>

        <header className="mt-6 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{content.title}</h1>
          <p className="mt-3 text-lg text-muted-foreground">{content.intro}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            From <span className="font-semibold text-foreground">{formatUsdFromCents(low)}</span>
            {serviceType === "rank_boost" ? " per division" : serviceType === "placements" ? " per game" : " per win"}.
          </p>
        </header>

        {/* Trust band */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TRUST.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground"
            >
              <Icon className="size-4 text-primary" />
              {label}
            </div>
          ))}
        </div>

        {/* Calculator */}
        <div className="mt-8">
          <Calculator catalog={catalog} />
        </div>

        {/* Content sections */}
        <div className="mt-16 grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="space-y-10">
            {content.sections.map((s) => (
              <section key={s.title}>
                <h2 className="text-xl font-bold tracking-tight">{s.title}</h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">{s.body}</p>
              </section>
            ))}

            <section>
              <h2 className="text-xl font-bold tracking-tight">Frequently asked questions</h2>
              <div className="mt-4 space-y-4">
                {content.faqs.map((f) => (
                  <details
                    key={f.question}
                    className="group rounded-lg border border-border bg-card/40 p-4"
                  >
                    <summary className="cursor-pointer list-none font-medium">
                      {f.question}
                    </summary>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>

          {/* Other services aside */}
          <aside className="lg:sticky lg:top-20 lg:h-fit">
            <div className="rounded-xl border border-border bg-card/40 p-5">
              <h3 className="font-semibold">Other {game.name} services</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {["rank-boost", "placements", "net-wins"]
                  .filter((slug) => slug !== service.slug)
                  .map((slug) => {
                    const s = getServiceBySlug(slug)!;
                    return (
                      <li key={slug}>
                        <Link
                          href={`/${gameSlug}/${slug}`}
                          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          {s.name}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
