import { createBrowserClient } from "@supabase/ssr"

import { getSupabaseConfig } from "@/lib/supabase/config"

let browserClient: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (browserClient) {
    return browserClient
  }

  const { url, key } = getSupabaseConfig()

  browserClient = createBrowserClient(url, key)

  return browserClient
}