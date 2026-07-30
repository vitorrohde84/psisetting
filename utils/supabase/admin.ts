import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase admin client using the service_role key.
 * Used exclusively in API routes that run without user authentication
 * (e.g., iCal calendar feed consumed by iPhone).
 *
 * SECURITY NOTE: This key bypasses RLS. Never import this in client code.
 * The SPEC.md rule "never use service_role key in frontend" applies to
 * browser code — this is a server-side API route handler.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local (server-only, never NEXT_PUBLIC_)."
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
