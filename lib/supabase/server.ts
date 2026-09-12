import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseEnvironment } from "@/lib/supabase/env";

export async function createClient() {
  const { url: supabaseUrl, publicKey: supabaseKey } =
    getSupabaseEnvironment();

  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Cookie mutation may be unavailable in Server Components.
            // Middleware can handle session refresh.
          }
        },
      },
    }
  );
}