/**
 * Supabase env detection. Deliberately free of "server-only" and of any
 * supabase imports so it is importable from the proxy middleware, client
 * components, and the hermetic fast test suite (which force-blanks env).
 */

/**
 * True when the public Supabase env vars hold real values. False when they
 * are unset or still carry the `.env.example` placeholders — the deployed
 * zero-backend mode, in which every auth-dependent surface must degrade
 * gracefully rather than render a broken state.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return Boolean(
    url && anonKey && !url.includes("YOUR-PROJECT") && anonKey !== "your-anon-key",
  );
}

/**
 * True when trusted server code can use the service-role client: public config
 * is real AND SUPABASE_SERVICE_ROLE_KEY holds a non-placeholder value. Check
 * this before calling `createAdminClient()` (which throws when env is missing)
 * so degraded deploys return typed errors instead of 500s.
 */
export function isServiceRoleConfigured(): boolean {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return (
    isSupabaseConfigured() &&
    Boolean(serviceRoleKey) &&
    serviceRoleKey !== "your-service-role-key"
  );
}
