import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutClient } from "@/components/checkout/checkout-client";
import { getSessionProfile, getSessionUser } from "@/lib/auth/session";
import { getGames } from "@/lib/catalog/source";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Review your boost and place your order.",
  robots: { index: false },
};

/**
 * Checkout. The proxy already bounces signed-out visitors, but the page
 * re-checks identity on its own (redirects are never authorization) and needs
 * the profile anyway for the store-credit balance. The order intent itself
 * lives in sessionStorage ("rf.checkout.intent" — the exact QuoteRequest the
 * calculator sends to /api/quote), so everything order-specific renders
 * client-side inside <CheckoutClient/>; this page only provides the container
 * and the server-derived props.
 */
export default async function CheckoutPage() {
  const session = await getSessionProfile();
  if (!session) {
    // Signed out → login and come back. A signed-in user with no profile row
    // yet (the transient window before the `on_auth_user_created` trigger
    // lands) must NOT bounce to /login — that would loop — so show a notice.
    if (!(await getSessionUser())) redirect("/login?next=/checkout");
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
        <div className="mt-6 rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
          Your account is still being set up — refresh this page in a moment.
        </div>
      </div>
    );
  }

  // Canonical game names for the client's read-only summary (the client can't
  // touch the catalog source itself without dragging server code into the
  // bundle, and the intent is only known client-side).
  const games = await getGames();
  const gameNames: Record<string, string> = Object.fromEntries(games.map((g) => [g.slug, g.name]));

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Review your boost, then place the order — payment is confirmed manually after checkout.
      </p>

      <div className="mt-8">
        <CheckoutClient
          gameNames={gameNames}
          storeCreditCents={session.profile.store_credit_cents}
        />
      </div>
    </div>
  );
}
