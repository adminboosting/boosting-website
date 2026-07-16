import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { requireAdmin } from "@/lib/auth/session";

/**
 * Admin chrome: the shared site shell plus a thin "Admin" strip so staff always
 * know which side of the counter they're on. requireAdmin() redirects signed-out
 * visitors to /login and non-admins home. The proxy also redirects
 * unauthenticated /admin traffic, but redirects are not authorization — this
 * layout, every page below it, and every server action re-verify the role
 * themselves (spec A2: layers 2/3 hold alone).
 *
 * The strip doubles as the admin nav — deliberately static server-rendered
 * links (no pathname-highlight client subcomponent; the section headings on
 * each page carry the "where am I").
 */

const ADMIN_NAV = [
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/boosters", label: "Boosters" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="border-b border-border bg-secondary/40">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-6 py-1.5 text-xs">
          <p className="flex items-center gap-1.5 font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            Admin
          </p>
          <nav aria-label="Admin sections" className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
