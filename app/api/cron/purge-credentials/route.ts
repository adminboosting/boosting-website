import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isVaultConfigured } from "@/lib/credentials/vault";
import { isServiceRoleConfigured } from "@/lib/supabase/env";

/**
 * Daily credential-retention purge, invoked by Vercel Cron (vercel.json,
 * `0 6 * * *` — daily is the Hobby-plan allowance). Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}` automatically when CRON_SECRET is
 * set in the project env.
 *
 * The heavy modules (store.ts, the admin client) import "server-only", so
 * they are dynamically imported only after the auth + config gates pass —
 * this keeps the handler importable as a plain function by the hermetic fast
 * suite (which force-blanks Supabase env and asserts the 503 path).
 */

/** Days a finished order keeps its encrypted credentials before auto-deletion (§10). */
const RETENTION_DAYS = 7;

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Timing-safe bearer check. Both sides are hashed before timingSafeEqual —
 * it demands equal-length buffers, and hashing avoids leaking the secret's
 * length through the fast-fail. Unset CRON_SECRET means nobody is authorized.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (!header) return false;

  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const actual = createHash("sha256").update(header).digest();
  return timingSafeEqual(expected, actual);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }

  // Graceful degradation: the zero-backend deploy (placeholder env) answers
  // 503 instead of throwing — createAdminClient() throws at call time and the
  // vault throws on a missing key, so both are gated here.
  if (!isServiceRoleConfigured() || !isVaultConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503, headers: NO_STORE });
  }

  const [{ purgeCredentialsForFinishedOrders }, { createAdminClient }] = await Promise.all([
    import("@/lib/credentials/store"),
    import("@/lib/supabase/admin"),
  ]);

  const result = await purgeCredentialsForFinishedOrders(RETENTION_DAYS);

  // Best-effort run marker (admin-read only); per-row trail lives in
  // credential_access_log, written by the purge itself.
  await createAdminClient()
    .from("audit_log")
    .insert({
      actor_id: null,
      action: "credentials.purged",
      entity: "order_credentials",
      meta: { purged: result.count, retentionDays: RETENTION_DAYS },
    });

  return NextResponse.json({ purged: result.count }, { status: 200, headers: NO_STORE });
}
