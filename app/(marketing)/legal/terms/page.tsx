import type { Metadata } from "next";
import { LegalShell } from "@/components/legal/legal-shell";
import { BRAND_NAME, getSiteUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `${BRAND_NAME} Terms of Service (placeholder draft).`,
  alternates: { canonical: `${getSiteUrl()}/legal/terms` },
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      updated="Draft"
      intro={`These Terms govern your use of ${BRAND_NAME} and the boosting services offered on it. By placing an order you agree to them.`}
      sections={[
        {
          heading: "1. Non-affiliation",
          body: [
            `${BRAND_NAME} is an independent service and is not affiliated with, endorsed by, or sponsored by Riot Games, Valve, Blizzard Entertainment / Activision, NetEase, or any game publisher. All trademarks and game titles are the property of their respective owners and are used descriptively.`,
          ],
        },
        {
          heading: "2. Nature of the service & terms-of-service risk",
          body: [
            "We provide a first-party boosting service: our vetted boosters improve your rank in the game and mode you select. Boosting may violate a game publisher's terms of service, and the primary risk is action against your game account (including suspension).",
            "We reduce this risk with manual play only, region-matched connections, appear-offline options, no third-party tools or scripts, and private handling of your account and information. We cannot, however, guarantee that no action will be taken by a publisher.",
          ],
        },
        {
          heading: "3. Eligibility",
          body: [
            "You must be of legal age in your jurisdiction, or have verifiable parental/guardian consent, to use the service. You must have the authority to authorize access to any account you submit for a piloted order.",
          ],
        },
        {
          heading: "4. Your responsibilities",
          body: [
            "Provide accurate order information. For piloted orders, keep the account accessible and relay any two-factor codes promptly through your order chat. Do not log in during an active piloted order unless asked, as it can interrupt the work.",
          ],
        },
        {
          heading: "5. Payments & refunds",
          body: [
            "Prices are shown in USD and calculated by our server at checkout. Payment is required before work begins. Refunds are governed by our Refund Policy.",
          ],
        },
        {
          heading: "6. Limitation of liability",
          body: [
            "To the maximum extent permitted by law, our liability for any claim relating to the service is limited to the amount you paid for the affected order. We are not liable for publisher actions taken against an account.",
          ],
        },
        {
          heading: "7. Changes",
          body: [
            "We may update these Terms; material changes will be posted here with a new date. Continued use after changes constitutes acceptance.",
          ],
        },
      ]}
    />
  );
}
