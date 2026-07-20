import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { NotificationListener } from "@/components/notifications/notification-listener";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { requireBooster } from "@/lib/auth/session";

/**
 * Booster chrome: the shared site shell plus a thin "Booster desk" strip so
 * staff always know which side of the counter they're on (same shape as the
 * admin layout). requireBooster() redirects signed-out visitors to /login and
 * non-staff home; admins pass so the owner can inspect the surface.
 *
 * Three-layer rule (spec A2): this layout only REDIRECTS — every page and
 * server action below re-verifies identity + the active assignment itself,
 * and RLS (can_access_order) is the final gate underneath. A booster whose
 * assignment is revoked mid-session simply stops seeing the order.
 */
export default async function BoosterLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireBooster();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="border-b border-border bg-secondary/40">
        <p className="mx-auto w-full max-w-6xl px-6 py-1.5 text-xs font-medium text-muted-foreground">
          <Link
            href="/booster"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <Gamepad2 className="size-3.5 text-primary" aria-hidden="true" />
            Booster desk
          </Link>
        </p>
      </div>
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <NotificationListener userId={user.id} orderHrefBase="/booster/orders" />
    </div>
  );
}
