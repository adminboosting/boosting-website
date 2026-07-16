/**
 * Service-role data access for the deny-all `order_credentials` table (§10).
 * RLS + force RLS + zero grants mean PostgREST returns nothing to anon or
 * authenticated by design (supabase/migrations/0003_orders.sql) — every touch
 * goes through `createAdminClient()` here, AFTER the explicit app-side
 * ownership check those migration comments require. Encryption/decryption is
 * the pure vault's job (lib/credentials/vault.ts); this module never sees a
 * key and never logs plaintext.
 *
 * "server-only" on purpose: the fast suite cannot import this module. Its
 * pure collaborators (vault, schemas) are tested directly; the DB effects are
 * covered by tests/db/credential-vault.test.ts, which replicates the purge
 * predicate against real rows.
 */
import "server-only";
import { encryptCredentials, isVaultConfigured } from "@/lib/credentials/vault";
import type { OrderStatus } from "@/lib/orders/transitions";
import type { CredentialSubmission } from "@/lib/schemas/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";

/**
 * Piloted orders accept credentials only while there is work left to
 * start/finish — paid-or-later, pre-terminal. Mirrors the window rendered by
 * app/(shop)/orders/[id]/page.tsx; this list is the enforcing copy.
 */
export const CREDENTIAL_ACCEPTING_STATUSES: readonly OrderStatus[] = [
  "paid",
  "assigned",
  "in_progress",
  "paused",
];

/** Terminal order states whose credentials the retention purge may blank. */
export const FINISHED_ORDER_STATUSES: readonly OrderStatus[] = [
  "completed",
  "cancelled",
  "refunded",
];

/**
 * Typed failure codes for storeOrderCredentials. `not_found` covers both a
 * missing order AND someone else's order — the caller can never distinguish
 * "absent" from "forbidden" (same contract as the order detail page's 404).
 */
export type StoreCredentialsErrorCode =
  "not_configured" | "not_found" | "not_piloted" | "not_accepting" | "write_failed";

export type StoreCredentialsResult =
  { ok: true } | { ok: false; code: StoreCredentialsErrorCode; error: string };

/**
 * Encrypt and persist a customer's game-account login for a piloted order.
 *
 * Callers (the submitCredentials server action) have already authenticated
 * `userId` via requireUser(), but this function re-verifies everything the
 * 0003 migration comments demand — order exists, belongs to `userId`, is
 * piloted, and sits in a paid-or-later working state — through the admin
 * client, because the table's deny-all RLS means no policy will do it for us.
 *
 * Upserts on order_id (UNIQUE): a resubmission replaces the envelope and
 * clears deleted_at, reviving a previously purged slot. Every successful
 * store appends a credential_access_log row (action 'store').
 */
export async function storeOrderCredentials(
  orderId: string,
  userId: string,
  input: CredentialSubmission,
  ip?: string | null,
): Promise<StoreCredentialsResult> {
  // Graceful degradation: a mis-deployed env must never accept plaintext or
  // throw — createAdminClient() throws at call time when env is missing.
  if (!isServiceRoleConfigured() || !isVaultConfigured()) {
    return {
      ok: false,
      code: "not_configured",
      error: "Credential storage is not configured on this deployment.",
    };
  }

  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, user_id, mode, status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order || order.user_id !== userId) {
    return { ok: false, code: "not_found", error: "Order not found." };
  }
  if (order.mode !== "piloted") {
    return {
      ok: false,
      code: "not_piloted",
      error: "Duo orders are played together — we never need your login.",
    };
  }
  if (!CREDENTIAL_ACCEPTING_STATUSES.includes(order.status as OrderStatus)) {
    return {
      ok: false,
      code: "not_accepting",
      error: "This order is not accepting credentials right now.",
    };
  }

  // Plaintext exists only in this call frame; JSON.stringify drops an
  // undefined note. The DB stores only the base64 envelope.
  const envelope = encryptCredentials(JSON.stringify(input));

  const { data: credential, error: upsertError } = await admin
    .from("order_credentials")
    .upsert(
      {
        order_id: orderId,
        ciphertext: envelope.ciphertext,
        iv: envelope.iv,
        auth_tag: envelope.authTag,
        algo: envelope.algo,
        deleted_at: null,
      },
      { onConflict: "order_id" },
    )
    .select("id")
    .single();

  if (upsertError || !credential) {
    return { ok: false, code: "write_failed", error: "Could not store credentials. Try again." };
  }

  // Best-effort access trail (admin-read only); the stored envelope stands
  // even if this insert fails — same posture as the bootstrap audit row.
  await admin.from("credential_access_log").insert({
    order_id: orderId,
    credential_id: credential.id,
    accessed_by: userId,
    action: "store",
    ip: ip ?? null,
  });

  return { ok: true };
}

/** The order columns the purge predicate reads, embedded via the FK join. */
interface PurgeCandidateRow {
  id: string;
  order_id: string;
  orders: {
    status: OrderStatus;
    completed_at: string | null;
    updated_at: string;
  } | null;
}

/**
 * Retention purge (§10 auto-deletion): blank the envelope of every live
 * credential whose parent order finished (completed | cancelled | refunded)
 * more than `retentionDays` ago. "Finished at" is completed_at when set
 * (completed orders), else updated_at (cancelled/refunded never get a
 * completed_at). deleted_at is the only retention primitive the schema has —
 * purged rows keep their id/order_id but hold empty ciphertext/iv/auth_tag,
 * so a later resubmission can revive the slot via the store upsert.
 *
 * Idempotent: already-purged rows (deleted_at set) are excluded from both the
 * select and the update, so overlapping cron runs cannot double-count. One
 * credential_access_log row (action 'purge') is written per blanked row.
 * Returns the number of rows actually blanked.
 */
export async function purgeCredentialsForFinishedOrders(
  retentionDays: number,
): Promise<{ count: number }> {
  // Callers gate on isServiceRoleConfigured() (the cron route returns 503);
  // this throw is the defensive backstop, not a control-flow path.
  if (!isServiceRoleConfigured()) {
    throw new Error(
      "purgeCredentialsForFinishedOrders requires the service-role client; gate on isServiceRoleConfigured() first.",
    );
  }

  const admin = createAdminClient();
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  // !inner turns the FK embed into an inner join so the status filter on the
  // parent order excludes non-finished orders entirely. The timestamp
  // coalesce runs app-side — PostgREST cannot express
  // `coalesce(completed_at, updated_at) < cutoff`, and purge volume is tiny.
  const { data, error } = await admin
    .from("order_credentials")
    .select("id, order_id, orders!inner(status, completed_at, updated_at)")
    .is("deleted_at", null)
    .in("orders.status", FINISHED_ORDER_STATUSES as OrderStatus[]);

  if (error) {
    throw new Error(`Credential purge candidate query failed: ${error.message}`);
  }

  const due = ((data ?? []) as unknown as PurgeCandidateRow[]).filter((row) => {
    const finishedAt = row.orders?.completed_at ?? row.orders?.updated_at;
    return finishedAt !== undefined && finishedAt !== null && Date.parse(finishedAt) < cutoffMs;
  });

  if (due.length === 0) return { count: 0 };

  const { data: purged, error: purgeError } = await admin
    .from("order_credentials")
    .update({ ciphertext: "", iv: "", auth_tag: "", deleted_at: new Date().toISOString() })
    .in(
      "id",
      due.map((row) => row.id),
    )
    .is("deleted_at", null)
    .select("id, order_id");

  if (purgeError) {
    throw new Error(`Credential purge update failed: ${purgeError.message}`);
  }

  const blanked = (purged ?? []) as Array<{ id: string; order_id: string }>;

  if (blanked.length > 0) {
    // Best-effort trail, one row per purged credential (accessed_by null —
    // the actor is the cron, not a profile).
    await admin.from("credential_access_log").insert(
      blanked.map((row) => ({
        order_id: row.order_id,
        credential_id: row.id,
        accessed_by: null,
        action: "purge",
        ip: null,
      })),
    );
  }

  return { count: blanked.length };
}
