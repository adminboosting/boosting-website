/**
 * Runtime supabase-js catalog backend (server-only). Reuses the shared mappers +
 * assembly from db-source.ts, so it produces values identical to the SQL-reader
 * source that the price-parity test verifies. Dynamically imported by source.ts
 * only when a Supabase project is configured, so `server-only` / supabase-js never
 * enter the test graph or a file-mode bundle.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PricingSettings } from "@/lib/catalog/types";
import type { CatalogSource } from "@/lib/catalog/source";
import { DEFAULT_PRICING_SETTINGS } from "@/lib/catalog/data";
import {
  SERVICE_NAMES,
  assemble,
  rowToCoupon,
  rowToGame,
  rowToModifier,
  rowToNetWin,
  rowToPlacement,
  rowToRank,
  rowToRegion,
  type CatalogReaders,
  type Row,
} from "@/lib/catalog/db-source";

function supabaseReaders(client: SupabaseClient): CatalogReaders {
  const rowsOf = async (
    table: string,
    build: (q: ReturnType<SupabaseClient["from"]>) => unknown,
  ): Promise<Row[]> => {
    const { data, error } = (await build(client.from(table))) as {
      data: Row[] | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(`catalog read failed for ${table}: ${error.message}`);
    return (data ?? []) as Row[];
  };
  return {
    async games() {
      return (await rowsOf("games", (q) => q.select("*").order("sort_order"))).map(rowToGame);
    },
    async ranks(slug) {
      return (
        await rowsOf("ranks", (q) => q.select("*").eq("game_slug", slug).order("sort_index"))
      ).map(rowToRank);
    },
    async placementPrices(slug) {
      return (
        await rowsOf("placement_prices", (q) =>
          q.select("*").eq("game_slug", slug).order("price_per_game_cents"),
        )
      ).map(rowToPlacement);
    },
    async netWinGroups(slug) {
      return (
        await rowsOf("net_win_groups", (q) =>
          q.select("*").eq("game_slug", slug).order("price_per_win_cents"),
        )
      ).map(rowToNetWin);
    },
    async regions(slug) {
      return (
        await rowsOf("regions", (q) => q.select("*").eq("game_slug", slug).order("sort_order"))
      ).map(rowToRegion);
    },
    async modifiers() {
      return (await rowsOf("modifiers", (q) => q.select("*").order("sort_order"))).map(
        rowToModifier,
      );
    },
    async coupon(code) {
      if (!code) return null;
      const rows = await rowsOf("coupons", (q) =>
        q.select("*").eq("code", code.trim().toUpperCase()).limit(1),
      );
      return rows[0] ? rowToCoupon(rows[0]) : null;
    },
    async pricingSettings() {
      const rows = await rowsOf("site_settings", (q) =>
        q.select("value").eq("key", "pricing_settings").limit(1),
      );
      return (rows[0]?.value as PricingSettings) ?? DEFAULT_PRICING_SETTINGS;
    },
    async serviceName(type) {
      const rows = await rowsOf("services", (q) => q.select("name").eq("type", type).limit(1));
      return (rows[0]?.name as string) ?? SERVICE_NAMES[type];
    },
  };
}

/** Runtime DB catalog source using the server-only service-role client. */
export function createSupabaseCatalogSource(): CatalogSource {
  return assemble("database", supabaseReaders(createAdminClient()));
}
