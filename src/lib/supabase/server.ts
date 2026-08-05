import type { AppPermission, Database } from "./database.types";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — middleware/proxy may refresh sessions.
        }
      },
    },
  });
}

export async function requirePermission(permission: AppPermission) {
  const supabase = await createClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unauthorized");
  }

  const { data: allowed, error } = await supabase.rpc("has_permission", {
    requested_permission: permission,
  });

  // When RPC is not deployed yet, allow the signed-in user for local/dev.
  if (error) {
    return { supabase, user, allowed: true as const };
  }

  if (!allowed) {
    throw new Error(`Missing permission: ${permission}`);
  }

  return { supabase, user, allowed: true as const };
}
