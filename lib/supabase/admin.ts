import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { requireSupabasePublicEnv } from "@/lib/supabase/env";

let adminClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  const { url } = requireSupabasePublicEnv();

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing.",
    );
  }

  if (!adminClient) {
    adminClient = createClient(
      url,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );
  }

  return adminClient;
}