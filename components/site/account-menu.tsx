import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { buttonVariants } from "@/components/ui/button";
import { accountNavLinks } from "@/lib/auth/nav";
import { getSessionProfile } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/**
 * The header's right slot. Async server component: reads the session profile
 * once per request and renders either the marketing CTA pair (signed out —
 * also the zero-backend deploy, where getSessionProfile() short-circuits to
 * null, and the sub-second window before the profile trigger lands) or the
 * signed-in account controls.
 *
 * The slot is always visible below md (there is no mobile menu), so it stays
 * compact — at most three small controls: "My orders", one role link
 * (Booster desk / Admin, ghost so it never competes with the primary), and
 * the sign-out icon. Role links come from accountNavLinks(); they are
 * navigation sugar only — the target layouts re-verify the role server-side.
 */
export async function AccountMenu() {
  const session = await getSessionProfile();

  if (!session) {
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

  const [primary, ...roleLinks] = accountNavLinks(session.profile.role);

  return (
    <div className="flex items-center gap-2">
      {primary ? (
        <Link href={primary.href} className={cn(buttonVariants({ size: "sm" }))}>
          {primary.label}
        </Link>
      ) : null}
      {roleLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          {link.label}
        </Link>
      ))}
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
