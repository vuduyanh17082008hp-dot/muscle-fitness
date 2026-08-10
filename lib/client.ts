import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getSupabasePublicEnv,
  requireSupabasePublicEnv,
} from "@/lib/supabase/env";

let browserClient: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  const { url, publicKey } = requireSupabasePublicEnv();

  browserClient = createBrowserClient(url, publicKey);

  return browserClient;
}

export function tryCreateClient(): SupabaseClient | null {
  if (browserClient) {
    return browserClient;
  }

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

  browserClient = createBrowserClient(env.url, env.publicKey);

  return browserClient;
}
