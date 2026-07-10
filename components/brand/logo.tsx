import Link from "next/link";
import { FrogMascot } from "@/components/brand/frog-mascot";
import { BRAND_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Brand wordmark: the crowned-frog mascot + the name from BRAND_NAME. A rename
 * touches only the constant, the DB `brand_name` row, and the mascot artwork.
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
      <FrogMascot size={30} />
      <span className="text-lg">{BRAND_NAME}</span>
    </Link>
  );
}
