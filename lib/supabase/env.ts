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

export function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build"
}

/**
 * Read public Supabase env without throwing.
 * Returns null when URL or key is missing.
 */
export function getSupabasePublicEnv(): SupabaseEnvironment | null {
  const url = cleanEnvironmentValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  )

  const publicKey =
    cleanEnvironmentValue(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ) ??
    cleanEnvironmentValue(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    )

  if (!url || !publicKey) {
    return null
  }

  return {
    url,
    publicKey,
  }
}

/**
 * Strict runtime config. Throws when env is missing outside of
 * Next.js production static generation.
 *
 * During `next build` prerender, returns a non-secret placeholder so
 * pages like `/_not-found` (via root layout AuthProvider) can render
 * without crashing. Placeholders must never be treated as real credentials.
 */
export function requireSupabasePublicEnv(): SupabaseEnvironment {
  const env = getSupabasePublicEnv()

  if (env) {
    if (
      !env.url.startsWith("https://") ||
      !env.url.includes(".supabase.co")
    ) {
      if (isNextProductionBuild()) {
        return {
          url: "https://build-placeholder.supabase.co",
          publicKey: "build-placeholder-key",
        }
      }

      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase HTTPS project URL.",
      )
    }

    return env
  }

  if (isNextProductionBuild()) {
    return {
      url: "https://build-placeholder.supabase.co",
      publicKey: "build-placeholder-key",
    }
  }

  throw new Error(
    [
      "Missing Supabase project URL or public key.",
      "Add NEXT_PUBLIC_SUPABASE_URL and",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
      "to .env.local / Vercel project settings.",
    ].join(" "),
  )
}

/** @deprecated Prefer getSupabasePublicEnv / requireSupabasePublicEnv */
export function getSupabaseEnvironment(): SupabaseEnvironment {
  return requireSupabasePublicEnv()
}
