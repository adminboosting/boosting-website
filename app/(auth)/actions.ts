"use server";

import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { getSiteUrl } from "@/lib/config";
import { normalizeReferralCode } from "@/lib/referrals/core";
import { attributeReferral } from "@/lib/referrals/service";
import { signInSchema, signUpSchema } from "@/lib/schemas/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth server actions. Every action re-verifies its own inputs (zod) and talks
 * to Supabase through the user-scoped server client — the proxy middleware only
 * redirects and is never trusted for authorization. All three degrade
 * gracefully in the zero-backend deploy by returning a typed error instead of
 * touching a client that would fail against placeholder env.
 *
 * Profile rows are created by the `on_auth_user_created` trigger — actions
 * never insert into profiles.
 */

/** Returned by signIn via useActionState; success never returns (redirect). */
export interface SignInState {
  error: string | null;
}

/** Returned by signUp via useActionState. */
export interface SignUpState {
  ok: boolean;
  needsConfirmation: boolean;
  error: string | null;
}

const NOT_ENABLED = "Accounts are not enabled yet.";

/**
 * Same-origin path guard for `?next=` redirects. Anything that is not a plain
 * absolute path (protocol-relative `//`, backslash tricks, full URLs) falls
 * back to /account, so the login flow can never be used as an open redirect.
 * Duplicated in app/auth/callback/route.ts and the login page because "use
 * server" modules may only export async functions.
 */
function sanitizeNextPath(next: FormDataEntryValue | null): string {
  if (typeof next !== "string") return "/account";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/account";
}

/** Map Supabase auth error codes to copy a customer can act on. */
function friendlyAuthError(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "email_not_confirmed":
      return "Confirm your email first — check your inbox for the link.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists — sign in instead.";
    default:
      return error.message;
  }
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!isSupabaseConfigured()) return { error: NOT_ENABLED };

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and a password of at least 8 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: friendlyAuthError(error) };

  // redirect() throws NEXT_REDIRECT — deliberately outside any try/catch.
  redirect(sanitizeNextPath(formData.get("next")));
}

export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  if (!isSupabaseConfigured()) return { ok: false, needsConfirmation: false, error: NOT_ENABLED };

  const displayNameRaw = formData.get("displayName");
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName:
      typeof displayNameRaw === "string" && displayNameRaw.trim() ? displayNameRaw : undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      needsConfirmation: false,
      error: "Enter a valid email and a password of 8–72 characters.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      // Stored on the auth user's metadata. The `handle_new_user` trigger only
      // copies id + email into profiles; display_name syncing is a later phase.
      data: parsed.data.displayName ? { display_name: parsed.data.displayName } : {},
    },
  });
  if (error) return { ok: false, needsConfirmation: false, error: friendlyAuthError(error) };

  // Referral attribution — best-effort, strictly AFTER a successful signUp. A
  // hidden `ref` field is untrusted input: normalize here (junk becomes "no
  // referral"). attributeReferral never throws by contract; the try/catch is
  // belt-and-braces because a referral hiccup must never fail account
  // creation. Awaited (not fire-and-forget) so the write isn't lost when the
  // serverless invocation freezes after the response.
  const refRaw = formData.get("ref");
  const refCode = typeof refRaw === "string" ? normalizeReferralCode(refRaw) : null;
  if (refCode && data.user) {
    try {
      await attributeReferral(refCode, data.user.id);
    } catch (attributionError) {
      console.error("[auth] referral attribution failed:", attributionError);
    }
  }

  // With email confirmation ON, Supabase returns no session — the form shows
  // its "check your email" state. With it off, the user is already signed in.
  if (data.session) redirect("/account");
  return { ok: true, needsConfirmation: true, error: null };
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
