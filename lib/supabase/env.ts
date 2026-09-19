type SupabaseEnvironment = {
  url: string
  publicKey: string
}

function cleanEnvironmentValue(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined
  }

  const cleanedValue = value
    .trim()
    .replace(/^["']|["']$/g, "")

  return cleanedValue || undefined
}

export function getSupabaseEnvironment(): SupabaseEnvironment {
  const url = cleanEnvironmentValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  )

  /*
   * Ưu tiên Publishable Key mới.
   * Vẫn hỗ trợ ANON_KEY cũ để tương thích project legacy.
   */
  const publicKey =
    cleanEnvironmentValue(
      process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ) ??
    cleanEnvironmentValue(
      process.env
        .NEXT_PUBLIC_SUPABASE_ANON_KEY,
    )

  if (!url) {
    throw new Error(
      [
        "Missing Supabase project URL.",
        "Add NEXT_PUBLIC_SUPABASE_URL to .env.local.",
        "The .env.local file must be next to package.json.",
      ].join(" "),
    )
  }

  if (!publicKey) {
    throw new Error(
      [
        "Missing Supabase public API key.",
        "Add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "or the legacy NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "to .env.local, then restart the development server.",
      ].join(" "),
    )
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be a valid URL.",
    )
  }

  const isHostedSupabase =
    parsedUrl.protocol === "https:" &&
    parsedUrl.hostname.endsWith(".supabase.co")

  const isLoopbackSupabase =
    process.env.NODE_ENV !== "production" &&
    parsedUrl.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(
      parsedUrl.hostname,
    )

  if (!isHostedSupabase && !isLoopbackSupabase) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be a Supabase HTTPS project URL, or a loopback HTTP URL outside production.",
    )
  }

  return {
    url,
    publicKey,
  }
}
