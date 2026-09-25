/**
 * Hard stop for demo seeding. Never write to a hosted Supabase project.
 * Call before any auth or insert in local-only demo scripts.
 */

export function assertLocalSupabaseUrl(url: string): URL {
  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    throw new Error("Demo seed requires a valid loopback Supabase URL.")
  }

  const isLoopback = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
  const isHosted =
    parsed.hostname.endsWith(".supabase.co") || parsed.protocol === "https:"

  if (isHosted || !isLoopback || parsed.protocol !== "http:") {
    throw new Error(
      `Refusing to mutate ${parsed.origin}. Demo seed only targets local loopback HTTP (e.g. http://127.0.0.1:54321). Hosted project jlwszvtitjtgothgxubo is blocked.`,
    )
  }

  return parsed
}
