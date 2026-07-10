import Link from "next/link";
import { FrogMascot } from "@/components/brand/frog-mascot";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[80dvh] w-full max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
      <FrogMascot size={72} />
      <p className="mt-6 font-mono text-sm tracking-wide text-muted-foreground">404</p>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">This pad is empty.</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        The page you were after isn&rsquo;t here — it may have hopped off. Let&rsquo;s get you back
        to solid ground.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className={cn(buttonVariants())}>
          Back home
        </Link>
        <Link href="/games" className={cn(buttonVariants({ variant: "outline" }))}>
          Browse games
        </Link>
      </div>
    </main>
  );
}
