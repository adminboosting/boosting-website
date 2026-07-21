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

/**
 * Browser client whose REALTIME socket is authenticated as the signed-in user
 * BEFORE any channel subscribes.
 *
 * Why this exists: `postgres_changes` payloads are RLS-filtered per subscriber.
 * A realtime channel joined without the user's JWT connects anonymously, so
 * every RLS policy (`can_access_order`, `notifications_select_own`, …) matches
 * zero rows and the channel silently receives NOTHING — no error, just silence.
 * `createBrowserClient` loads the session from cookies asynchronously and only
 * pushes the token to the socket on the auth-state event, which can land AFTER
 * `.subscribe()` has already joined as anon. Awaiting the session and calling
 * `realtime.setAuth(token)` up front closes that race so the join carries the
 * JWT. (Later token refreshes are handled by supabase-js's own auth listener.)
 *
 * REST/PostgREST is unaffected — it authenticates from the cookie per request —
 * so only realtime consumers need this. Returns the same client for both the
 * subscription and any polling fallback done through it.
 */
export async function createRealtimeClient() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    await supabase.realtime.setAuth(session.access_token);
  }
  return supabase;
}
