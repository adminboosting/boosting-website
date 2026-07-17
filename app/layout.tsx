import type { Metadata } from "next";
import { Hanken_Grotesk, Space_Grotesk, Spline_Sans_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { BRAND_NAME, BRAND_TAGLINE, getSiteUrl } from "@/lib/config";
import { PageTransition } from "@/components/site/page-transition";
import "./globals.css";

// Type system: a bold geometric/technical display (Space Grotesk — reads as
// competitive gaming), a warm humanist body (Hanken Grotesk), and a precise mono
// for prices (Spline Sans Mono). All SIL OFL, self-hosted by next/font with
// display: swap (no layout shift, no render-blocking).
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });
const splineMono = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-spline-mono",
  display: "swap",
});

const siteUrl = getSiteUrl();
const description = `${BRAND_NAME}: professional, safe boosting for League of Legends, Valorant, Overwatch 2, and Marvel Rivals — piloted or duo, priced live. ${BRAND_TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${BRAND_NAME} — Game Boosting for LoL, Valorant, Overwatch 2 & Marvel Rivals`,
    template: `%s | ${BRAND_NAME}`,
  },
  description,
  applicationName: BRAND_NAME,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    title: `${BRAND_NAME} — Game Boosting`,
    description,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND_NAME} — Game Boosting`,
    description,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND_NAME,
    url: siteUrl,
    description,
  };

  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${hanken.variable} ${splineMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {children}
        <PageTransition />
        <Analytics />
        <script
          type="application/ld+json"
          // JSON.stringify output is safe to inline as structured data.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </body>
    </html>
  );
}
