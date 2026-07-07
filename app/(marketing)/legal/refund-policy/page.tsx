import type { Metadata } from "next";
import { LegalShell } from "@/components/legal/legal-shell";
import { BRAND_NAME, SUPPORT_EMAIL_FALLBACK, getSiteUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: `${BRAND_NAME} Refund Policy (placeholder draft).`,
  alternates: { canonical: `${getSiteUrl()}/legal/refund-policy` },
};

export default function RefundPolicyPage() {
  return (
    <LegalShell
      title="Refund Policy"
      updated="Draft"
      intro="We want you to feel safe ordering. This policy explains when and how refunds work."
      sections={[
        {
          heading: "1. Before work begins",
          body: [
            "If you cancel before a booster has started your order, you receive a full refund.",
          ],
        },
        {
          heading: "2. Partial progress",
          body: [
            "If you cancel after work has begun, you receive a pro-rated refund for the portion not yet completed, based on the progress recorded on your order.",
          ],
        },
        {
          heading: "3. How to request",
          body: [
            `Contact ${SUPPORT_EMAIL_FALLBACK} or use your order chat. We aim to resolve refund requests quickly.`,
          ],
        },
        {
          heading: "4. Crypto payments",
          body: [
            "Refunds for crypto payments are processed manually to your wallet. We'll coordinate the details with you via support.",
          ],
        },
        {
          heading: "5. Store credit",
          body: [
            `Cashback and referral rewards are issued as ${BRAND_NAME} store credit, which can be applied to future orders. Store credit itself is non-cashable.`,
          ],
        },
      ]}
    />
  );
}
