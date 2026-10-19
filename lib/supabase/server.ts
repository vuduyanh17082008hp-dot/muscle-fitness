import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/database.types.generated";
import { getSupabaseEnvironment } from "@/lib/supabase/env";

async function getCookieOptions() {
  const cookieStore = await cookies();

  return {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },

      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Parameters<typeof cookieStore.set>[2];
        }[],
      ) {
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
  };
}

export async function createClient() {
  const { url: supabaseUrl, publicKey: supabaseKey } =
    getSupabaseEnvironment();

  return createServerClient(
    supabaseUrl,
    supabaseKey,
    await getCookieOptions()
  );
}

/**
 * Same client, typed from the canonical generated Database
 * (database.types.generated.ts). Prefer this for new code; the untyped
 * createClient() remains for modules whose queries do not yet match the
 * migration schema (see docs/database-types.md).
 */
export async function createTypedClient() {
  const { url: supabaseUrl, publicKey: supabaseKey } =
    getSupabaseEnvironment();

  return createServerClient<Database>(
    supabaseUrl,
    supabaseKey,
    await getCookieOptions()
  );
}
