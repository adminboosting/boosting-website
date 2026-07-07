import type { Metadata } from "next";
import { Mail, MessagesSquare } from "lucide-react";
import { BRAND_NAME, SUPPORT_EMAIL_FALLBACK, getSiteUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get in touch with ${BRAND_NAME} support for questions, custom quotes, or help with an order.`,
  alternates: { canonical: `${getSiteUrl()}/contact` },
};

export default function ContactPage() {
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
    </div>
  );
}
