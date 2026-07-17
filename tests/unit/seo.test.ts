import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { getSiteUrl } from "@/lib/config";

/** Normalize MetadataRoute.Robots rules (object-or-array) to a flat rule list. */
function robotsRules() {
  const result = robots();
  return Array.isArray(result.rules) ? result.rules : [result.rules];
}

function robotsDisallow(): string[] {
  const rule = robotsRules()[0]!;
  const disallow = rule.disallow ?? [];
  return Array.isArray(disallow) ? disallow : [disallow];
}

describe("robots", () => {
  it("disallows every authed/private surface", () => {
    const disallow = robotsDisallow();
    for (const path of [
      "/admin",
      "/booster",
      "/checkout",
      "/account",
      "/orders",
      "/login",
      "/sign-up",
      "/auth",
      "/api",
    ]) {
      expect(disallow).toContain(path);
    }
  });

  it("no longer lists the stale /dashboard route", () => {
    expect(robotsDisallow()).not.toContain("/dashboard");
  });

  it("allows the public site for all agents and points at the sitemap", () => {
    const result = robots();
    const rule = robotsRules()[0]!;
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toBe("/");
    expect(result.sitemap).toBe(`${getSiteUrl()}/sitemap.xml`);
    expect(result.host).toBe(getSiteUrl());
  });
});

describe("sitemap", () => {
  it("carries no per-deploy lastModified on any entry", async () => {
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.lastModified, entry.url).toBeUndefined();
    }
  });

  it("contains no route that robots disallows", async () => {
    const base = getSiteUrl();
    const disallow = robotsDisallow();
    for (const entry of await sitemap()) {
      expect(entry.url.startsWith(base), entry.url).toBe(true);
      const path = entry.url.slice(base.length);
      for (const blocked of disallow) {
        expect(path.startsWith(blocked), `${path} vs ${blocked}`).toBe(false);
      }
    }
  });

  it("lists the homepage at priority 1 plus the marketing, game, and money pages", async () => {
    const entries = await sitemap();
    const base = getSiteUrl();
    const paths = entries.map((e) => e.url.slice(base.length));

    const home = entries.find((e) => e.url === base);
    expect(home?.priority).toBe(1);
    expect(home?.changeFrequency).toBe("daily");

    for (const expected of ["/games", "/how-it-works", "/reviews", "/faq", "/contact"]) {
      expect(paths).toContain(expected);
    }
    // At least one game landing page and one game/service money page.
    expect(paths).toContain("/league-of-legends");
    expect(paths.some((p) => /^\/[a-z0-9-]+\/[a-z0-9-]+$/.test(p) && !p.startsWith("/legal"))).toBe(
      true,
    );
  });
});
