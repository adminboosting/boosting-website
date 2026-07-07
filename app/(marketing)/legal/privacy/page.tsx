import type { Metadata } from "next";
import { LegalShell } from "@/components/legal/legal-shell";
import { BRAND_NAME, SUPPORT_EMAIL_FALLBACK, getSiteUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `${BRAND_NAME} Privacy Policy (placeholder draft).`,
  alternates: { canonical: `${getSiteUrl()}/legal/privacy` },
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="Draft"
      intro={`This policy explains what ${BRAND_NAME} collects, why, and your rights over your data.`}
      sections={[
        {
          heading: "1. What we collect",
          body: [
            "Account details (email, display name) and order information (game, ranks, options, price).",
            "For piloted orders only: the game-account credentials you submit (login, password, and any note). We do not need these for duo/self-play orders.",
            "Basic technical data (IP-derived signals) used for fraud prevention and security.",
          ],
        },
        {
          heading: "2. How we protect credentials",
          body: [
            "Game credentials are encrypted in transit and encrypted at rest using AES-256-GCM before they are stored. They are decrypted only server-side for your assigned booster or an admin, every access is logged, and they are never written to logs or error reports.",
            "Credentials are automatically deleted after your order completes (by default within 72 hours), and you can delete them yourself at any time from your dashboard.",
          ],
        },
        {
          heading: "3. Why we process data",
          body: [
            "To provide and fulfill your order, communicate about it, prevent fraud, process payments, and meet legal obligations.",
          ],
        },
        {
          heading: "4. Retention",
          body: [
            "Order records are retained as needed for support, accounting, and legal compliance. Credentials follow the deletion schedule above and are not retained after fulfillment.",
          ],
        },
        {
          heading: "5. Your rights",
          body: [
            "Depending on your location (including under GDPR and LGPD), you may have rights to access, correct, delete, or export your data, and to object to certain processing. Contact us to exercise these rights.",
            "Age requirement: you must be of legal age or have parental/guardian consent to use the service.",
          ],
        },
        {
          heading: "6. Analytics & cookies",
          body: [
            "We use privacy-friendly, cookieless analytics to understand site usage. We do not sell your personal data.",
          ],
        },
        {
          heading: "7. Contact",
          body: [`Questions or requests: ${SUPPORT_EMAIL_FALLBACK}.`],
        },
      ]}
    />
  );
}
