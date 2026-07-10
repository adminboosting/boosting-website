/**
 * Generates supabase/seed.sql FROM the in-code catalog (spec B1) so placeholder
 * prices are defined in exactly one place and the DB can never drift from the
 * file. Re-run with `pnpm gen:seed` whenever lib/catalog/* changes.
 *
 * The emitted SQL is idempotent (upserts on each table's natural key), so
 * `pnpm db:seed` is safe to run repeatedly. All pricing is PLACEHOLDER.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  COUPONS,
  DEFAULT_PRICING_SETTINGS,
  GAMES,
  LOYALTY_TIERS,
  MODIFIERS,
  getNetWinGroups,
  getPlacementPrices,
  getRanks,
  getRegions,
} from "../lib/catalog/data";
import { SERVICES } from "../lib/catalog/content";
import { BRAND_NAME, SUPPORT_EMAIL_FALLBACK } from "../lib/config";

// --- SQL literal helpers ----------------------------------------------------
const s = (v: string) => `'${v.replace(/'/g, "''")}'`;
const b = (v: boolean) => (v ? "true" : "false");
const nullable = (v: number | string | null | undefined, render: (x: never) => string) =>
  v === null || v === undefined ? "null" : render(v as never);
const arr = (v: string[]) => `array[${v.map(s).join(", ")}]::text[]`;
const jsonb = (v: unknown) => `${s(JSON.stringify(v))}::jsonb`;

function upsert(
  table: string,
  columns: string[],
  rows: string[][],
  conflict: string,
  updateCols: string[],
): string {
  const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  const setClause = updateCols.map((c) => `${c} = excluded.${c}`).join(", ");
  return (
    `insert into public.${table} (${columns.join(", ")}) values\n${values}\n` +
    `on conflict (${conflict}) do update set ${setClause};\n`
  );
}

const blocks: string[] = [];

// --- games ------------------------------------------------------------------
blocks.push(
  upsert(
    "games",
    ["slug", "name", "short_name", "divisions_per_tier", "is_active", "sort_order"],
    GAMES.map((g, i) => [
      s(g.slug),
      s(g.name),
      s(g.shortName),
      String(g.divisionsPerTier),
      b(true),
      String((i + 1) * 10),
    ]),
    "slug",
    ["name", "short_name", "divisions_per_tier", "is_active", "sort_order"],
  ),
);

// --- services ---------------------------------------------------------------
blocks.push(
  upsert(
    "services",
    ["type", "slug", "name", "short", "blurb", "is_active", "sort_order"],
    SERVICES.map((sv, i) => [
      `${s(sv.type)}::service_type`,
      s(sv.slug),
      s(sv.name),
      s(sv.short),
      s(sv.blurb),
      b(true),
      String((i + 1) * 10),
    ]),
    "type",
    ["slug", "name", "short", "blurb", "is_active", "sort_order"],
  ),
);

// --- ranks ------------------------------------------------------------------
{
  const rows = GAMES.flatMap((g) =>
    getRanks(g.slug).map((r) => [
      s(r.gameSlug),
      s(r.tier),
      String(r.division),
      s(r.label),
      String(r.sortIndex),
      String(r.climbPriceCents),
      String(r.climbEtaHours),
      b(r.isPurchasable),
    ]),
  );
  blocks.push(
    upsert(
      "ranks",
      [
        "game_slug",
        "tier",
        "division",
        "label",
        "sort_index",
        "climb_price_cents",
        "climb_eta_hours",
        "is_purchasable",
      ],
      rows,
      "game_slug, sort_index",
      ["tier", "division", "label", "climb_price_cents", "climb_eta_hours", "is_purchasable"],
    ),
  );
}

// --- placement_prices -------------------------------------------------------
{
  const rows = GAMES.flatMap((g) =>
    getPlacementPrices(g.slug).map((p) => [
      s(p.gameSlug),
      `${s(p.band)}::placement_band`,
      s(p.label),
      String(p.pricePerGameCents),
      String(p.minGames),
      String(p.maxGames),
      String(p.etaPerGameHours),
    ]),
  );
  blocks.push(
    upsert(
      "placement_prices",
      [
        "game_slug",
        "band",
        "label",
        "price_per_game_cents",
        "min_games",
        "max_games",
        "eta_per_game_hours",
      ],
      rows,
      "game_slug, band",
      ["label", "price_per_game_cents", "min_games", "max_games", "eta_per_game_hours"],
    ),
  );
}

// --- net_win_groups ---------------------------------------------------------
{
  const rows = GAMES.flatMap((g) =>
    getNetWinGroups(g.slug).map((n) => [
      s(n.gameSlug),
      `${s(n.group)}::net_win_group`,
      s(n.label),
      String(n.pricePerWinCents),
      arr(n.tiers),
      String(n.etaPerWinHours),
    ]),
  );
  blocks.push(
    upsert(
      "net_win_groups",
      ["game_slug", "group_key", "label", "price_per_win_cents", "tiers", "eta_per_win_hours"],
      rows,
      "game_slug, group_key",
      ["label", "price_per_win_cents", "tiers", "eta_per_win_hours"],
    ),
  );
}

// --- modifiers --------------------------------------------------------------
blocks.push(
  upsert(
    "modifiers",
    [
      "key",
      "label",
      "description",
      "kind",
      "amount",
      "eta_multiplier",
      "is_default_on",
      "is_active",
      "sort_order",
      "game_slug",
      "service_type",
      "hidden_in_duo",
    ],
    MODIFIERS.map((m) => [
      s(m.key),
      s(m.label),
      s(m.description),
      `${s(m.kind)}::modifier_kind`,
      String(m.amount),
      String(m.etaMultiplier),
      b(m.isDefaultOn),
      b(m.isActive),
      String(m.sortOrder),
      nullable(m.gameSlug, (x: string) => s(x)),
      m.serviceType === null ? "null" : `${s(m.serviceType)}::service_type`,
      b(m.hiddenInDuo),
    ]),
    "key",
    [
      "label",
      "description",
      "kind",
      "amount",
      "eta_multiplier",
      "is_default_on",
      "is_active",
      "sort_order",
      "game_slug",
      "service_type",
      "hidden_in_duo",
    ],
  ),
);

// --- regions ----------------------------------------------------------------
{
  const rows = GAMES.flatMap((g) =>
    getRegions(g.slug).map((r) => [
      s(r.gameSlug),
      s(r.code),
      s(r.label),
      String(r.multiplier),
      b(r.isDefault),
      String(r.sortOrder),
    ]),
  );
  blocks.push(
    upsert(
      "regions",
      ["game_slug", "code", "label", "multiplier", "is_default", "sort_order"],
      rows,
      "game_slug, code",
      ["label", "multiplier", "is_default", "sort_order"],
    ),
  );
}

// --- coupons ----------------------------------------------------------------
blocks.push(
  upsert(
    "coupons",
    ["code", "kind", "amount", "min_order_cents", "max_uses", "uses", "expires_at", "is_active"],
    COUPONS.map((c) => [
      s(c.code),
      `${s(c.kind)}::coupon_kind`,
      String(c.amount),
      String(c.minOrderCents),
      nullable(c.maxUses, (x: number) => String(x)),
      String(c.uses),
      nullable(c.expiresAt, (x: string) => s(x)),
      b(c.isActive),
    ]),
    "code",
    ["kind", "amount", "min_order_cents", "max_uses", "expires_at", "is_active"],
  ),
);

// --- loyalty_tiers ----------------------------------------------------------
blocks.push(
  upsert(
    "loyalty_tiers",
    ["name", "min_lifetime_spend_cents", "discount_bp", "cashback_bp", "sort_order"],
    LOYALTY_TIERS.map((t) => [
      s(t.name),
      String(t.minLifetimeSpendCents),
      String(t.discountBp),
      String(t.cashbackBp),
      String(t.sortOrder),
    ]),
    "name",
    ["min_lifetime_spend_cents", "discount_bp", "cashback_bp", "sort_order"],
  ),
);

// --- site_settings ----------------------------------------------------------
blocks.push(
  upsert(
    "site_settings",
    ["key", "value"],
    [
      [s("brand_name"), jsonb(BRAND_NAME)],
      [s("support_email"), jsonb(SUPPORT_EMAIL_FALLBACK)],
      [s("pricing_reviewed"), jsonb(false)],
      [
        s("pricing_placeholder_note"),
        jsonb("All pricing is PLACEHOLDER — review and set final prices before launch."),
      ],
      [s("pricing_settings"), jsonb(DEFAULT_PRICING_SETTINGS)],
    ],
    "key",
    ["value"],
  ),
);

const header = `-- ============================================================================
-- supabase/seed.sql — GENERATED by \`pnpm gen:seed\` from lib/catalog/*.
-- DO NOT EDIT BY HAND. Prices live in lib/catalog/data.ts (single source of
-- truth, spec B1). Idempotent: safe to run repeatedly via \`pnpm db:seed\`.
-- All pricing is PLACEHOLDER — the admin reviews it before launch.
-- ============================================================================

`;

const out = header + blocks.join("\n");
const target = join(process.cwd(), "supabase", "seed.sql");
writeFileSync(target, out, "utf8");
console.log(`✓ Wrote ${target} (${out.split("\n").length} lines).`);
