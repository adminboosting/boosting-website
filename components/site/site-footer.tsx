import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { GAMES } from "@/lib/catalog/data";
import { BRAND_NAME, SUPPORT_EMAIL_FALLBACK } from "@/lib/config";

const COMPANY_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/reviews", label: "Reviews" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

const LEGAL_LINKS = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/refund-policy", label: "Refund policy" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              First-party boosting by vetted pros. Climb faster, safely.
            </p>
          </div>

          <FooterColumn title="Games">
            {GAMES.map((game) => (
              <FooterLink key={game.slug} href={`/${game.slug}`}>
                {game.name}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title="Company">
            {COMPANY_LINKS.map((link) => (
              <FooterLink key={link.href} href={link.href}>
                {link.label}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title="Legal">
            {LEGAL_LINKS.map((link) => (
              <FooterLink key={link.href} href={link.href}>
                {link.label}
              </FooterLink>
            ))}
          </FooterColumn>
        </div>

        <div className="mt-10 border-t border-border/60 pt-6">
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {BRAND_NAME} is an independent service and is not affiliated with, endorsed by, or
            sponsored by Riot Games, Valve, Blizzard Entertainment / Activision, NetEase, or any game
            publisher. All trademarks and game titles are the property of their respective owners and
            are used here descriptively.
          </p>
          <div className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()} {BRAND_NAME}. Pricing shown is placeholder and subject to
              change.
            </span>
            <a className="underline-offset-4 hover:underline" href={`mailto:${SUPPORT_EMAIL_FALLBACK}`}>
              {SUPPORT_EMAIL_FALLBACK}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        {children}
      </Link>
    </li>
  );
}
