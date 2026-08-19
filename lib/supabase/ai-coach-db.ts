import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiCoachDatabase } from "@/types/ai-coach-database.types";

export type AiCoachSupabaseClient = SupabaseClient<AiCoachDatabase>;

export function asAiCoachDb(
  client: SupabaseClient,
): AiCoachSupabaseClient {
  return client as AiCoachSupabaseClient;
}
