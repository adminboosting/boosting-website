import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client (uses the anon key, subject to RLS).
 * Env vars are referenced as literals so Next inlines them into the client
 * bundle at build time.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
