import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers to common questions about account safety, piloted vs duo boosting, timing, payments, refunds, and how our boosters are vetted.",
  alternates: { canonical: `${getSiteUrl()}/faq` },
};

const FAQS = [
  {
    q: "Is boosting safe for my account?",
    a: "We minimize risk with 100% manual play, region-matched connections, appear-offline by default, and no third-party tools. Boosting can still violate a game's terms of service — the primary risk is account action by the publisher — so we handle every order privately and encrypt any credentials. See our Terms for the full disclosure.",
  },
  {
    q: "What's the difference between piloted and duo?",
    a: "Piloted means a booster logs into your account and plays for you — it's the fastest option. Duo (self-play) means you queue in the same games as the booster; you stay in control of your account, but it takes a little longer and costs more.",
  },
  {
    q: "How do you handle my login for piloted orders?",
    a: "Your login is encrypted in your browser's request and stored encrypted at rest. Only your assigned booster and our admins can decrypt it, every access is logged, and it's automatically deleted after your order completes. We never store it in plain text or in logs.",
  },
  {
    q: "How long will my order take?",
    a: "Every configuration shows an estimated time range before you buy. Express speeds it up; duo and some privacy options add time. Your booster posts live progress in your order chat.",
  },
  {
    q: "How do payments work?",
    a: "We're crypto-first via NOWPayments. A card option runs in test mode during our launch phase. You can also pay partly or fully with store credit earned from cashback and referrals.",
  },
  {
    q: "Can I get a refund?",
    a: "Yes. You get a full refund before work begins, and a pro-rated refund for partial progress if you cancel mid-order. Reach out via support and we'll sort it quickly.",
  },
  {
    q: "How are boosters vetted?",
    a: "Boosters are first-party — we recruit, verify, and rank-cap them ourselves. Each is limited to the games and ranks they've proven, and their completion stats are tracked on every order.",
  },
  {
    q: "Do you offer higher ranks than shown?",
    a: "The very top ranks are available as a custom quote — contact support and we'll arrange it.",
  },
];

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Frequently asked questions</h1>
      <div className="mt-8 space-y-3">
        {FAQS.map((f) => (
          <details key={f.q} className="group rounded-lg border border-border bg-card/40 p-5">
            <summary className="cursor-pointer list-none font-medium">{f.q}</summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
