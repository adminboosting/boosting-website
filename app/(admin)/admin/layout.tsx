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
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="border-b border-border bg-secondary/40">
        <p className="mx-auto flex w-full max-w-6xl items-center gap-1.5 px-6 py-1.5 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
          Admin
        </p>
      </div>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
