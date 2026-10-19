import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { getSupabaseEnvironment } from "@/lib/supabase/env"

/** Privileged server-only Supabase client. Never import from Client Components. */
export function createSupabaseAdminClient(): SupabaseClient {
  const { url } = getSupabaseEnvironment()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.")
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Recovery-specific name retained for existing callers. */
export const createRecoveryAdminClient = createSupabaseAdminClient
