import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getSupabaseEnvironment(): {
  url: string;
  key: string;
} {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL in .env.local.",
    );
  }

  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }

  return {
    url,
    key,
  };
}

export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseEnvironment();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },

      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(
            ({ name, value, options }) => {
              cookieStore.set(
                name,
                value,
                options,
              );
            },
          );
        } catch {
          /*
           * Server Components đôi khi không thể ghi cookie.
           * proxy.ts sẽ chịu trách nhiệm refresh session.
           */
        }
      },
    },
  });
}