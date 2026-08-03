import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import type { Database } from "@/lib/database/types"
import { getSupabaseEnvironment } from "@/lib/supabase/env"

export async function createClient() {
  const cookieStore = await cookies()

  const { url, publicKey } =
    getSupabaseEnvironment()

  return createServerClient<Database>(
    url,
    publicKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                cookieStore.set(
                  name,
                  value,
                  options,
                )
              },
            )
          } catch {
            /*
             * Server Components không thể luôn ghi cookie.
             * Proxy sẽ xử lý refresh session.
             */
          }
        },
      },
    },
  )
}