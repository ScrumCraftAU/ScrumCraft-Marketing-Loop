import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/lib/env";

let client: SupabaseClient | null = null;

const RETRY_DELAYS_MS = [300, 1000];

/**
 * Retries requests Supabase rejected before running them: a momentary clock difference
 * makes its gateway answer 401 "JWT issued at future", and gateway hiccups return
 * 502/503/504 or drop the connection. Other errors (including 500) are returned as-is.
 */
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= RETRY_DELAYS_MS.length;
    let res: Response;
    try {
      res = await fetch(input, init);
    } catch (err) {
      if (last) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      continue;
    }
    const gatewayError = res.status === 502 || res.status === 503 || res.status === 504;
    const clockSkew = res.status === 401 && /issued at future/i.test(await res.clone().text());
    if (last || !(gatewayError || clockSkew)) return res;
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
}

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
    global: { fetch: fetchWithRetry },
  });
  return client;
}
