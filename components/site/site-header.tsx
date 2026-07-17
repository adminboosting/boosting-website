import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { AccountMenu } from "@/components/site/account-menu";
import { MobileNav } from "@/components/site/mobile-nav";

const NAV_LINKS = [
  { href: "/games", label: "Games" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/reviews", label: "Reviews" },
  { href: "/faq", label: "FAQ" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      {/* Below md the row may wrap: logo + account controls + the disclosure
          trigger can exceed narrow viewports (375px) when signed in, and a
          wrapped second row beats horizontal page scroll. md+ is a fixed
          single 16-unit row, unchanged. */}
      <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 sm:px-6 md:h-16 md:flex-nowrap md:gap-x-4 md:py-0">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 md:gap-2">
          <AccountMenu />
          <MobileNav links={NAV_LINKS} />
        </div>
      </div>
    </header>
  );
}
