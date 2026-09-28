import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/lib/env";

let client: SupabaseClient | null = null;

/**
 * Server-only Supabase client using the secret key. Every table has RLS on with no
 * policies, so this is the only way in — access control is Vercel SSO in front of the app.
 */
export function db(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY)");
  }
  client ??= createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
