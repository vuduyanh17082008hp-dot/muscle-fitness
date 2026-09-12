import { getSupabaseEnvironment } from "@/lib/supabase/env";

/* =========================================================
   TYPES
========================================================= */

export type SupabaseConfig = {
  url: string;
  key: string;
};

/* =========================================================
   CONFIG

   Thin adapter over the single source of truth in
   lib/supabase/env.ts, kept for callers expecting the
   {url, key} shape.
========================================================= */

export function getSupabaseConfig(): SupabaseConfig {
  const { url, publicKey } = getSupabaseEnvironment();

  return {
    url,
    key: publicKey,
  };
}