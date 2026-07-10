"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Client errors are captured by Sentry when configured; log for local dev.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[80dvh] w-full max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
      <div
        aria-hidden
        className="size-12 rounded-full"
        style={{ background: "color-mix(in oklch, var(--pond) 25%, transparent)" }}
      />
      <h1 className="mt-6 text-3xl font-semibold sm:text-4xl">Something slipped into the pond.</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        That&rsquo;s a ripple on our end, not yours. Try again — and if it keeps happening, our
        support team can sort it out.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Back home
        </Link>
      </div>
    </main>
  );
}
