import { NotificationListener } from "@/components/notifications/notification-listener";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getSessionProfile } from "@/lib/auth/session";

/**
 * Shared chrome for the signed-in commerce surfaces (/checkout, /account,
 * /orders). Identical shell to the marketing layout so the shop stays inside
 * the lily-pond system; every page in this group is auth-dependent and
 * therefore dynamic — nothing here (or below) sets `revalidate`.
 *
 * Mounts the per-user NotificationListener so a customer who is on the site
 * gets the live popup + chime when their booster hits "Notify customer" (email
 * remains the reliable channel when they're offline). getSessionProfile()
 * degrades to null when signed out or in zero-backend mode — the listener
 * simply isn't rendered.
 */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      {session && <NotificationListener userId={session.user.id} />}
    </div>
  );
}
