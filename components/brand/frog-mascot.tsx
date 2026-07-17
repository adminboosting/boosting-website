/**
 * RankedFrogs mascot — a crowned frog ("king of the ranked ladder").
 *
 * The SVG markup is exported as a string so the same artwork is the single
 * source of truth for the header logo, the favicon, and the social/OG image.
 * Colors are fixed brand colors (not theme vars) so the mascot renders
 * identically everywhere, including standalone contexts with no CSS.
 */
export const FROG_SVG_MARKUP = `<svg viewBox="0 0 48 48" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="24" cy="29" rx="17" ry="14" fill="#3FC46E"/>
  <circle cx="15" cy="16" r="8" fill="#3FC46E"/>
  <circle cx="33" cy="16" r="8" fill="#3FC46E"/>
  <ellipse cx="24" cy="34" rx="10" ry="6" fill="#5AD588" opacity="0.55"/>
  <path d="M17.5 10.5 L18.3 4.5 L21.6 8.2 L24 3 L26.4 8.2 L29.7 4.5 L30.5 10.5 Z" fill="#F6C948"/>
  <rect x="17" y="9.6" width="14" height="2.9" rx="1.3" fill="#E9B738"/>
  <circle cx="24" cy="6.6" r="1.1" fill="#EE5D6C"/>
  <circle cx="15" cy="16" r="4.4" fill="#FFFFFF"/>
  <circle cx="33" cy="16" r="4.4" fill="#FFFFFF"/>
  <circle cx="15" cy="16.4" r="2.2" fill="#17211B"/>
  <circle cx="33" cy="16.4" r="2.2" fill="#17211B"/>
  <circle cx="16.1" cy="15.3" r="0.85" fill="#FFFFFF"/>
  <circle cx="34.1" cy="15.3" r="0.85" fill="#FFFFFF"/>
  <circle cx="21" cy="26" r="1" fill="#24603F"/>
  <circle cx="27" cy="26" r="1" fill="#24603F"/>
  <path d="M15 31 Q24 38 33 31" stroke="#24603F" stroke-width="2" stroke-linecap="round" fill="none"/>
</svg>`;

import { cn } from "@/lib/utils";

/**
 * The crowned frog is a recurring character. Pass `hop` to make it spring on
 * hover (or when an ancestor with `.group` is hovered), or add a motion class
 * via `className` (e.g. `motion-frog-celebrate` on a price lock). All motion is
 * transform/opacity and collapses under prefers-reduced-motion.
 */
export function FrogMascot({
  className,
  size = 28,
  hop = false,
}: {
  className?: string;
  size?: number;
  hop?: boolean;
}) {
  return (
    <span
      className={cn("motion-frog", hop && "motion-frog-hop", className)}
      role="img"
      aria-label="RankedFrogs frog mascot"
      style={{ display: "inline-flex", width: size, height: size, flexShrink: 0 }}
      // Static, trusted markup — single-sourced with the favicon and OG image.
      dangerouslySetInnerHTML={{ __html: FROG_SVG_MARKUP }}
    />
  );
}
