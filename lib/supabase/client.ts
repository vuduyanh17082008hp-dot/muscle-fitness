import {
  createBrowserClient,
} from "@supabase/ssr"

import type {
  SupabaseClient,
} from "@supabase/supabase-js"

import type {
  Database,
} from "@/lib/database/types"

import {
  getSupabaseEnvironment,
} from "@/lib/supabase/env"

let supabaseBrowserClient:
  | SupabaseClient<Database>
  | undefined

export function createClient(): SupabaseClient<Database> {
  if (supabaseBrowserClient) {
    return supabaseBrowserClient
  }

  const { url, publicKey } =
    getSupabaseEnvironment()

  supabaseBrowserClient =
    createBrowserClient<Database>(
      url,
      publicKey,
    )

  return supabaseBrowserClient
}