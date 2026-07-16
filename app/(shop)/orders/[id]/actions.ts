"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { storeOrderCredentials } from "@/lib/credentials/store";
import { credentialSubmissionSchema } from "@/lib/schemas/auth";

/**
 * Credential submission for piloted orders. The action authenticates the
 * caller itself (the proxy only redirects) and validates the form shape, then
 * hands off to storeOrderCredentials — which re-verifies ownership, piloted
 * mode, and paid-state through the service role, encrypts before anything
 * touches the database, and returns a typed "not configured" error instead of
 * ever accepting plaintext on a mis-deployed env. Plaintext credentials exist
 * only between the FormData parse and the vault's encrypt call frame; nothing
 * here logs them.
 */

/** Returned by submitCredentials via useActionState. */
export interface SubmitCredentialsState {
  ok: boolean;
  error: string | null;
}

/**
 * Best-effort client IP for the credential_access_log trail. Vercel sets
 * x-forwarded-for; the first hop is the client. Null (local dev, exotic
 * proxies) is fine — the log column is nullable.
 */
async function clientIp(): Promise<string | null> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return headerList.get("x-real-ip");
}

/**
 * Bound by the form as `submitCredentials.bind(null, orderId)` — orderId is
 * client-controlled either way, so ownership is proven server-side in
 * storeOrderCredentials, never assumed from the binding.
 */
export async function submitCredentials(
  orderId: string,
  _prev: SubmitCredentialsState,
  formData: FormData,
): Promise<SubmitCredentialsState> {
  // Independent identity check (spec A2 layer 2). requireUser() redirects via
  // NEXT_REDIRECT when signed out — deliberately outside any try/catch.
  const user = await requireUser();

  // Blank/whitespace note collapses to undefined so the encrypted payload
  // never carries an empty field (same posture as signUp's displayName).
  const noteRaw = formData.get("note");
  const parsed = credentialSubmissionSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    note: typeof noteRaw === "string" && noteRaw.trim() ? noteRaw : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter your account username and password." };
  }

  // Re-verifies order exists + belongs to this user + piloted + accepting
  // statuses, encrypts, upserts, and logs — or degrades with a typed error
  // (code "not_configured" covers a missing vault key or service role).
  const result = await storeOrderCredentials(orderId, user.id, parsed.data, await clientIp());
  if (!result.ok) return { ok: false, error: result.error };

  // The order page checks credential existence server-side — refresh it so a
  // reload shows the "credentials received" note instead of the form.
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, error: null };
}
