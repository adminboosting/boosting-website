import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create an account to place orders, track progress, and earn cashback credit.",
  robots: { index: false },
};

export default async function SignUpPage() {
  // The proxy already bounces signed-in visitors off /sign-up; this re-check
  // keeps the page correct on its own (redirects are never authorization).
  if (await getSessionUser()) redirect("/account");

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Place orders, track progress in real time, and earn cashback credit on every boost.
      </p>

      {isSupabaseConfigured() ? (
        <>
          <SignUpForm />

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              Sign in
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
