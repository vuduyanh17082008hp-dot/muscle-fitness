import { createBrowserClient } from "@supabase/ssr";

function getSupabaseEnvironment() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL.",
    );
  }

  if (!supabaseKey) {
    throw new Error(
      "Missing Supabase publishable or anon key.",
    );
  }

  return {
    supabaseUrl,
    supabaseKey,
  };
}

export function createClient() {
  const {
    supabaseUrl,
    supabaseKey,
  } = getSupabaseEnvironment();

  return createBrowserClient(
    supabaseUrl,
    supabaseKey,
  );
}