import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { buttonVariants } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/**
 * The header's right slot. Async server component: reads the session once per
 * request and renders either the marketing CTA pair (signed out — also the
 * zero-backend deploy, where getSessionUser() short-circuits to null) or the
 * signed-in account controls.
 *
 * The slot is always visible below md (there is no mobile menu), so it stays
 * compact — two small controls max in either state.
 */
export async function AccountMenu() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          Sign in
        </Link>
        <Link href="/games" className={cn(buttonVariants({ size: "sm" }))}>
          Get started
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/account" className={cn(buttonVariants({ size: "sm" }))}>
        My orders
      </Link>
      {/* signOut re-verifies the session server-side; this form is just the trigger. */}
      <form action={signOut}>
        <button
          type="submit"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          aria-label="Sign out"
        >
          <LogOut aria-hidden="true" />
          <span className="sr-only">Sign out</span>
        </button>
      </form>
    </div>
  );
}
