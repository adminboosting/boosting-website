import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { BRAND_NAME, BRAND_TAGLINE, getSiteUrl } from "@/lib/config";
import "./globals.css";

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
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {children}
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
