import Link from "next/link";
import { BRAND_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Brand wordmark. The glyph is derived from BRAND_NAME so a rename needs no
 * change here (spec §1: rename touches only the constant, the DB row, and the
 * logo asset).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-tight text-foreground",
        className,
      )}
      aria-label={`${BRAND_NAME} home`}
    >
      <span className="grid size-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        {BRAND_NAME.charAt(0)}
      </span>
      <span className="text-lg">{BRAND_NAME}</span>
    </Link>
  );
}
