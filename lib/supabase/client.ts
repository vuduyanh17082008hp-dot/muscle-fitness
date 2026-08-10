import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getSupabasePublicEnv,
  requireSupabasePublicEnv,
} from "@/lib/supabase/env";

/**
 * Create a browser Supabase client.
 * Throws at runtime when env is missing (after build).
 */
export function createClient(): SupabaseClient {
  const { url, publicKey } = requireSupabasePublicEnv();

  return createBrowserClient(url, publicKey);
}

/**
 * Safe for root layout / AuthProvider prerender.
 * Returns null when public Supabase env is not configured.
 */
export function tryCreateClient(): SupabaseClient | null {
  const env = getSupabasePublicEnv();

  if (!env) {
    return null;
  }

  if (
    !env.url.startsWith("https://") ||
    !env.url.includes(".supabase.co")
  ) {
    return null;
  }

  return createBrowserClient(env.url, env.publicKey);
}
