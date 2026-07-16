import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

/**
 * Shared chrome for the signed-in commerce surfaces (/checkout, /account,
 * /orders). Identical shell to the marketing layout so the shop stays inside
 * the lily-pond system; every page in this group is auth-dependent and
 * therefore dynamic — nothing here (or below) sets `revalidate`.
 */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
