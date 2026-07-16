import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

/**
 * Centered narrow shell for the auth pages. Same chrome as the marketing
 * layout — only the main column changes, so login/sign-up stay visually inside
 * the lily-pond system without duplicating any tokens.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
