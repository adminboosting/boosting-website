import type { MetadataRoute } from "next";
import { getGames } from "@/lib/catalog/source";
import { allMoneyPagePaths } from "@/lib/catalog/content";
import { getSiteUrl } from "@/lib/config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();

  const staticRoutes = [
    "",
    "/games",
    "/how-it-works",
    "/reviews",
    "/faq",
    "/contact",
    "/legal/terms",
    "/legal/privacy",
    "/legal/refund-policy",
  ];

  const gameRoutes = (await getGames()).map((g) => `/${g.slug}`);
  const moneyRoutes = allMoneyPagePaths().map((p) => `/${p.game}/${p.service}`);

  return [...staticRoutes, ...gameRoutes, ...moneyRoutes].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : path.split("/").length > 2 ? 0.8 : 0.6,
  }));
}
