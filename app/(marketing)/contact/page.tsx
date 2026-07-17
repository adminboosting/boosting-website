import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { suggestFaqs, type FaqEntry } from "@/lib/ai/faq-suggest";
import { BRAND_NAME, SUPPORT_EMAIL_FALLBACK, getSiteUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get in touch with ${BRAND_NAME} support for questions, custom quotes, or help with an order.`,
  alternates: { canonical: `${getSiteUrl()}/contact` },
};

/**
 * Condensed mirror of the /faq copy for the "Common answers" matcher below —
 * short answers here, full answers on /faq (keep the topics in sync with
 * app/(marketing)/faq/page.tsx when that copy changes).
 */
const CONTACT_FAQS: FaqEntry[] = [
  {
    question: "Is boosting safe for my account?",
    answer:
      "We minimize risk with 100% manual play, region-matched connections, appear-offline by default, and no third-party tools. Boosting can still violate a game's terms of service — see our Terms for the full disclosure.",
  },
  {
    question: "What's the difference between piloted and duo?",
    answer:
      "Piloted means a booster logs into your account and plays for you — fastest. Duo (self-play) means you queue with the booster; you keep control, but it takes longer and costs more.",
  },
  {
    question: "How do you handle my login for piloted orders?",
    answer:
      "Your login is encrypted at rest, visible only to your assigned booster and our admins, access-logged, and deleted automatically after your order completes.",
  },
  {
    question: "How long will my order take?",
    answer:
      "Every configuration shows an estimated time range before you buy. Express speeds it up; duo and some privacy options add time. Your booster posts live progress in your order chat.",
  },
  {
    question: "How do payments work?",
    answer:
      "We're crypto-first via NOWPayments, with a card option in test mode during launch. You can also pay partly or fully with store credit from cashback and referrals.",
  },
  {
    question: "Can I get a refund?",
    answer:
      "Yes — a full refund before work begins, and a pro-rated refund for partial progress if you cancel mid-order.",
  },
  {
    question: "How are boosters vetted?",
    answer:
      "Boosters are first-party — we recruit, verify, and rank-cap them ourselves, and track their completion stats on every order.",
  },
  {
    question: "Do you offer higher ranks than shown?",
    answer: "The very top ranks are available as a custom quote — email us and we'll arrange it.",
  },
];

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // Deterministic FAQ suggestions — AI feature "faq_suggestions"
  // (lib/ai/features.ts). Zero-JS wiring: a plain GET form round-trips the
  // query through searchParams, keyword-overlap scoring picks the answers.
  // Reading searchParams makes this page dynamic — a deliberate trade for a
  // tiny page with no data fetches.
  const { q: qRaw } = await searchParams;
  const query = typeof qRaw === "string" ? qRaw.slice(0, 200).trim() : "";
  const matches = query ? suggestFaqs(query, CONTACT_FAQS) : [];
  const suggestions = matches.length > 0 ? matches : CONTACT_FAQS.slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Contact us</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Questions, custom quotes for top ranks, or help with an order — we&rsquo;re here.
      </p>

      <div className="mt-8 space-y-4">
        <a
          href={`mailto:${SUPPORT_EMAIL_FALLBACK}`}
          className="flex items-center gap-4 rounded-xl border border-border bg-card/50 p-6 transition-colors hover:border-primary/50"
        >
          <Mail className="size-6 text-primary" />
          <div>
            <h2 className="font-semibold">Email support</h2>
            <p className="text-sm text-muted-foreground">{SUPPORT_EMAIL_FALLBACK}</p>
          </div>
        </a>

        <div className="flex items-center gap-4 rounded-xl border border-border bg-card/50 p-6">
          <MessagesSquare className="size-6 text-accent" />
          <div>
            <h2 className="font-semibold">Order chat</h2>
            <p className="text-sm text-muted-foreground">
              Once you place an order, you get a private chat with your booster and our team for
              real-time updates.
            </p>
          </div>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">Common answers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe your question and we&rsquo;ll match it against our FAQ — most questions have an
          instant answer.
        </p>

        <form method="get" action="/contact" className="mt-4 flex flex-wrap gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="e.g. refund, how long, is it safe"
            aria-label="Search common questions"
            className="h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="sm" variant="outline">
            Find answers
          </Button>
        </form>

        {query && matches.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            No direct match for &ldquo;{query}&rdquo; — the usual suspects are below, or email us
            and we&rsquo;ll answer quickly.
          </p>
        )}

        <div className="mt-4 space-y-3">
          {suggestions.map((faq) => (
            <details
              key={faq.question}
              // Matched answers open so the searcher reads without a click.
              open={matches.length > 0 || undefined}
              className="group rounded-lg border border-border bg-card/40 p-5"
            >
              <summary className="cursor-pointer list-none font-medium">{faq.question}</summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
            </details>
          ))}
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Full answers live on the{" "}
          <Link href="/faq" className="text-primary hover:underline">
            FAQ page
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
