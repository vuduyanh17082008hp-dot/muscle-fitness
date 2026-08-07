import { requireSupabasePublicEnv } from "@/lib/supabase/env"

export function getSupabaseConfig() {
  const { url, publicKey } = requireSupabasePublicEnv()

  return {
    url,
    key: publicKey,
  }
}
