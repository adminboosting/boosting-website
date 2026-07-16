import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to track your orders, chat with your booster, and spend store credit.",
  robots: { index: false },
};

/**
 * Same-origin path guard for `?next=` — mirror of the one in
 * app/(auth)/actions.ts (which may only export async functions).
 */
function sanitizeNextPath(next: string | undefined): string {
  if (typeof next !== "string") return "/account";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
    ? next
    : "/account";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = sanitizeNextPath(params.next);

  // The proxy already bounces signed-in visitors off /login; this re-check
  // keeps the page correct on its own (redirects are never authorization).
  if (await getSessionUser()) redirect(next);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in to track your orders, chat with your booster, and spend store credit.
      </p>

      {isSupabaseConfigured() ? (
        <>
          {params.error === "auth" && (
            <div className="mt-6 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                That confirmation link didn&rsquo;t work — it may have expired. Sign in below, or
                create a new account to get a fresh link.
              </span>
            </div>
          )}

          <LoginForm next={next} />

          <p className="mt-6 text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link href="/sign-up" className="text-primary underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
          Accounts aren&rsquo;t enabled on this deployment yet — sign-in &amp; secure checkout
          arrive in the next release. The price calculator works without an account.
        </div>
      )}
    </div>
  );
}
