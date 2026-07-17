"use client";

import { useEffect } from "react";

/**
 * Root-layout error boundary. This renders when the root layout itself
 * throws, so globals.css (and the whole token system) may never load —
 * every style below is inline, with literal values copied from the
 * app/globals.css tokens (--paper, --ink, --ink-soft, --pond,
 * --primary-foreground) so the page still reads as RankedFrogs.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Captured by Sentry when configured; log for local dev (same convention
    // as app/error.tsx).
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "5rem 1.5rem",
          backgroundColor: "oklch(0.985 0.008 135)", // --paper
          color: "oklch(0.24 0.022 168)", // --ink
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          textAlign: "center",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <main style={{ maxWidth: "36rem" }}>
          <div
            aria-hidden
            style={{
              width: "3rem",
              height: "3rem",
              margin: "0 auto",
              borderRadius: "9999px",
              backgroundColor: "oklch(0.5 0.132 153 / 0.25)", // --pond at 25%
            }}
          />
          <h1
            style={{
              margin: "1.5rem 0 0",
              fontSize: "1.875rem",
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            Something slipped into the pond.
          </h1>
          <p
            style={{
              margin: "0.75rem auto 0",
              maxWidth: "28rem",
              lineHeight: 1.6,
              color: "oklch(0.44 0.02 165)", // --ink-soft
            }}
          >
            The whole page hit a snag on our end, not yours. Reload to hop back in &mdash; if it
            keeps happening, our support team can sort it out.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "2rem",
              padding: "0.625rem 1.25rem",
              borderRadius: "0.5rem",
              border: "none",
              backgroundColor: "oklch(0.5 0.132 153)", // --pond
              color: "oklch(0.99 0.01 140)", // --primary-foreground
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </main>
      </body>
    </html>
  );
}
