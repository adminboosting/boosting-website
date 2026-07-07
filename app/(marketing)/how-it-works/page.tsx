import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessagesSquare, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getSiteUrl } from "@/lib/config";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Configure your boost, check out securely, get matched with a vetted booster, and track your climb to completion with live chat and progress.",
  alternates: { canonical: `${getSiteUrl()}/how-it-works` },
};

const STEPS = [
  {
    icon: Sparkles,
    title: "1. Configure & price",
    body: "Choose your game, current and desired rank (or games/wins), mode, region, and options. The calculator shows a live, itemized price and an estimated time range — nothing is hidden.",
  },
  {
    icon: ShieldCheck,
    title: "2. Checkout securely",
    body: "Pay with crypto or (in test mode) card. For piloted orders you submit your login through an encrypted form — it's readable only by your assigned booster and is deleted after completion.",
  },
  {
    icon: MessagesSquare,
    title: "3. Get matched & chat",
    body: "A vetted booster claims your order and opens a private order chat. Ask questions, share 2FA codes when needed, and watch progress screenshots as your rank climbs.",
  },
  {
    icon: Trophy,
    title: "4. Reach your goal",
    body: "When you hit your target the order is marked complete, your credentials are purged, and you earn cashback store credit and loyalty progress. Leave a review to help others.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Four steps from &ldquo;stuck&rdquo; to your goal rank — transparent pricing, vetted pros,
          and safety at every stage.
        </p>
      </header>

      <div className="mt-10 space-y-4">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-4 rounded-xl border border-border bg-card/50 p-6">
            <Icon className="size-6 shrink-0 text-primary" />
            <div>
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <Link href="/games" className={cn(buttonVariants({ size: "lg" }))}>
          Configure your boost
          <ArrowRight />
        </Link>
      </div>
    </div>
  );
}
