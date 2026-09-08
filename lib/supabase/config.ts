/* =========================================================
   TYPES
========================================================= */

export type SupabaseConfig = {
  url: string;
  key: string;
};

/* =========================================================
   CONFIG
========================================================= */

export function getSupabaseConfig():
  SupabaseConfig {
  const url =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL
      ?.trim();

  const publishableKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ?.trim();

  const anonKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY
      ?.trim();

  const key =
    publishableKey ??
    anonKey;

  if (!url) {
    throw new Error(
      [
        "Supabase configuration error:",
        "NEXT_PUBLIC_SUPABASE_URL is missing.",
        "Add it to .env.local for development",
        "and Vercel Environment Variables for deployment.",
      ].join(" "),
    );
  }

  if (!key) {
    throw new Error(
      [
        "Supabase configuration error:",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.",
        "Add one of them to .env.local and Vercel.",
      ].join(" "),
    );
  }

  return {
    url,
    key,
  };
}