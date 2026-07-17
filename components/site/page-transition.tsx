"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FROG_SVG_MARKUP } from "@/components/brand/frog-mascot";

/**
 * Big route transition (spec: "playful esports" showpiece). On an internal
 * navigation a pond-green curtain sweeps across the screen with the crowned frog
 * bouncing on it — covering the outgoing page, then sliding off to reveal the
 * incoming one. Flow: click → cover → router.push (new page renders hidden
 * behind the curtain) → pathname change → reveal.
 *
 * Performance: animates transform + opacity ONLY. Fully skipped (plain instant
 * navigation) under prefers-reduced-motion — both in the click guard here and by
 * the global reduced-motion rule in globals.css.
 */
type Phase = "idle" | "covering" | "covered" | "revealing";

function isModifiedClick(e: MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

export function PageTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const pending = useRef<string | null>(null);
  const reduced = useRef(false);
  const prevPath = useRef(pathname);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Intercept same-origin, same-tab link navigations to play the transition.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || isModifiedClick(e) || reduced.current) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        anchor.getAttribute("target") === "_blank" ||
        anchor.hasAttribute("download") ||
        !href.startsWith("/") ||
        href.startsWith("//") ||
        href.startsWith("#")
      ) {
        return;
      }
      if (href.split(/[?#]/)[0] === pathname) return; // same page
      e.preventDefault();
      pending.current = href;
      setPhase("covering");
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  // When the cover finishes, commit navigation; when the reveal finishes, reset.
  const onAnimEnd = useCallback(
    (e: React.AnimationEvent) => {
      if (e.animationName === "pt-cover") {
        setPhase("covered");
        if (pending.current) {
          router.push(pending.current);
          pending.current = null;
        }
      } else if (e.animationName === "pt-reveal") {
        setPhase("idle");
      }
    },
    [router],
  );

  // New route rendered (behind the curtain) → slide the curtain away.
  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      setPhase((p) => (p === "covered" ? "revealing" : "idle"));
    }
  }, [pathname]);

  return (
    <div className={`page-transition page-transition--${phase}`} aria-hidden="true">
      <div className="page-transition__panel" onAnimationEnd={onAnimEnd}>
        <span
          className="page-transition__frog"
          // Static, trusted markup — the shared crowned-frog artwork.
          dangerouslySetInnerHTML={{ __html: FROG_SVG_MARKUP }}
        />
      </div>
    </div>
  );
}
