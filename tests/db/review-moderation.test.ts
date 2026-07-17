import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { type Actor, asActor, bootstrapDb, seedUser } from "./helpers/bootstrap";

/**
 * The Phase 4 moderation surface on real Postgres (PGlite): the admin page
 * lists EVERY review through the service role, the publish/unpublish flip in
 * app/(admin)/admin/reviews/actions.ts is a service-role UPDATE, and the
 * public /reviews feed (lib/reviews/public.ts) is a service-role join that
 * must filter on is_published itself — RLS is bypassed there by design, so
 * these tests pin what anon can see around each flip. The author-side RLS
 * lifecycle (insert guards, self-publish denial) lives in reviews-rls.test.ts
 * and stays untouched.
 */
const CAROL = "aaaaaaaa-1111-0000-0000-000000000001"; // reviews her completed order
const DAN = "bbbbbbbb-1111-0000-0000-000000000002"; // stranger customer
const ORDER_DONE = "0d0d0d0d-1111-0000-0000-0000000000d1"; // carol, completed
const REVIEW_ID = "9b9b9b9b-1111-0000-0000-0000000000b1";

let db: PGlite;

async function count(actor: Actor, sql: string, params: unknown[] = []): Promise<number> {
  return asActor(db, actor, async () => {
    const r = await db.query<{ n: string }>(`select count(*)::text as n from (${sql}) q`, params);
    return Number(r.rows[0]!.n);
  });
}

/** The service-role UPDATE that setReviewPublished issues, verbatim in SQL. */
async function setPublished(reviewId: string, published: boolean): Promise<number> {
  return asActor(db, { kind: "service" }, async () => {
    const r = await db.query(
      `update public.reviews set is_published = $2 where id = $1 returning id`,
      [reviewId, published],
    );
    return r.rows.length;
  });
}

beforeAll(async () => {
  db = await bootstrapDb();

  await seedUser(db, { id: CAROL, role: "customer" });
  await seedUser(db, { id: DAN, role: "customer" });
  // The public feed truncates to a first name — give Carol a full one.
  await db.query(`update public.profiles set display_name = 'Carol Smith' where id = $1`, [CAROL]);

  // Minimal catalog row so the orders FK is satisfied.
  await db.query(
    `insert into public.games (slug, name, short_name, divisions_per_tier) values ($1,$2,$3,$4)`,
    ["valorant", "Valorant", "VAL", 3],
  );
  // Status seeded directly (superuser setup) — the transition walk isn't under
  // test here, the moderation visibility flips are.
  await db.query(
    `insert into public.orders
       (id, user_id, game_slug, service_type, mode, region_code, config, subtotal_cents, total_cents, status)
     values ($1,$2,'valorant','rank_boost','piloted','na','{}'::jsonb, 5000, 5000, 'completed')`,
    [ORDER_DONE, CAROL],
  );

  // The review arrives through the author's own RLS path, unpublished — the
  // exact state app/(shop)/orders/[id]/actions.ts leaves behind.
  await asActor(db, { kind: "user", userId: CAROL }, async () => {
    await db.query(
      `insert into public.reviews (id, order_id, user_id, rating, body, is_published)
       values ($1, $2, $3, 5, 'Fast climb, great comms.', false)`,
      [REVIEW_ID, ORDER_DONE, CAROL],
    );
  });
});

afterAll(async () => {
  await db?.close();
});

// Ordering note: these describes run top-to-bottom in one database — the
// lifecycle is unpublished → publish flip → public feed join → unpublish flip.

describe("while unpublished", () => {
  it("anon and stranger customers see nothing; the service role (admin queue) sees it", async () => {
    expect(await count({ kind: "anon" }, "select id from public.reviews")).toBe(0);
    expect(await count({ kind: "user", userId: DAN }, "select id from public.reviews")).toBe(0);
    expect(await count({ kind: "service" }, "select id from public.reviews")).toBe(1);
  });

  it("the service-role queue reads the pending row with its embeds intact", async () => {
    const rows = await asActor(db, { kind: "service" }, async () => {
      const r = await db.query<{ is_published: boolean; game_slug: string }>(
        `select r.is_published, o.game_slug
         from public.reviews r join public.orders o on o.id = r.order_id
         where r.id = $1`,
        [REVIEW_ID],
      );
      return r.rows;
    });
    expect(rows).toEqual([{ is_published: false, game_slug: "valorant" }]);
  });
});

describe("publish flip (service role, as setReviewPublished issues it)", () => {
  it("updates exactly one row", async () => {
    expect(await setPublished(REVIEW_ID, true)).toBe(1);
  });

  it("makes the review anon-visible, body and rating included", async () => {
    const rows = await asActor(db, { kind: "anon" }, async () => {
      const r = await db.query<{ rating: number; body: string }>(
        `select rating, body from public.reviews where id = $1`,
        [REVIEW_ID],
      );
      return r.rows;
    });
    expect(rows).toEqual([{ rating: 5, body: "Fast climb, great comms." }]);
  });

  it("feeds the public /reviews join (service role MUST filter on is_published itself)", async () => {
    const rows = await asActor(db, { kind: "service" }, async () => {
      const r = await db.query<{
        rating: number;
        game_slug: string;
        service_type: string;
        display_name: string;
      }>(
        `select r.rating, o.game_slug, o.service_type::text as service_type, p.display_name
         from public.reviews r
         join public.orders o on o.id = r.order_id
         join public.profiles p on p.id = r.user_id
         where r.is_published = true
         order by r.created_at desc limit 24`,
      );
      return r.rows;
    });
    expect(rows).toEqual([
      {
        rating: 5,
        game_slug: "valorant",
        service_type: "rank_boost",
        display_name: "Carol Smith",
      },
    ]);
  });
});

describe("unpublish flip (takedown path)", () => {
  it("hides the review from anon again without deleting it", async () => {
    expect(await setPublished(REVIEW_ID, false)).toBe(1);
    expect(await count({ kind: "anon" }, "select id from public.reviews")).toBe(0);
    expect(await count({ kind: "service" }, "select id from public.reviews")).toBe(1);
    // The author keeps sight of her own review throughout.
    expect(await count({ kind: "user", userId: CAROL }, "select id from public.reviews")).toBe(1);
  });
});
