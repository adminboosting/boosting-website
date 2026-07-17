import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Every authed/private surface. (/dashboard was a stale entry — the
        // route never shipped; account/orders/auth pages are the real ones.)
        disallow: [
          "/admin",
          "/booster",
          "/checkout",
          "/account",
          "/orders",
          "/login",
          "/sign-up",
          "/auth",
          "/api",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
