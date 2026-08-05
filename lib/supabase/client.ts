import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/app-database.types";

let browserClient:
  | ReturnType<
      typeof createBrowserClient<Database>
    >
  | undefined;

function getSupabaseConfig() {
  const supabaseUrl =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL
      ?.trim();

  const supabaseKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ?.trim() ||
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY
      ?.trim();

  if (!supabaseUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL in .env.local",
    );
  }

  if (!supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }

  return {
    supabaseUrl,
    supabaseKey,
  };
}

export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  const {
    supabaseUrl,
    supabaseKey,
  } = getSupabaseConfig();

  browserClient =
    createBrowserClient<Database>(
      supabaseUrl,
      supabaseKey,
    );

  return browserClient;
}