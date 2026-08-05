import type {
  SupabaseClient,
  User,
} from "@supabase/supabase-js"

function findFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

function getUsernameFromEmail(email: string | null | undefined) {
  if (!email) {
    return null
  }

  return email.split("@")[0] || null
}

/**
 * Sync auth metadata into public.profiles.
 * Uses user_id as the production primary key from the foundation schema.
 */
export async function syncAuthUserProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<void> {
  const metadata = user.user_metadata as Record<string, unknown>

  const identityMetadata =
    user.identities?.[0]?.identity_data as
      | Record<string, unknown>
      | undefined

  const emailUsername = getUsernameFromEmail(user.email)

  const fullName =
    findFirstString(
      metadata.full_name,
      metadata.name,
      metadata.display_name,
      identityMetadata?.full_name,
      identityMetadata?.name,
      emailUsername,
    ) ?? "Muscle Fitness Client"

  const username =
    findFirstString(
      metadata.username,
      metadata.preferred_username,
      metadata.user_name,
      identityMetadata?.preferred_username,
      identityMetadata?.user_name,
      emailUsername,
    ) ?? user.id.slice(0, 8)

  const avatarUrl = findFirstString(
    metadata.avatar_url,
    metadata.picture,
    identityMetadata?.avatar_url,
    identityMetadata?.picture,
  )

  const provider =
    findFirstString(user.app_metadata?.provider) ?? "email"

  const now = new Date().toISOString()

  const payload = {
    user_id: user.id,
    email: user.email ?? null,
    full_name: fullName,
    username,
    avatar_url: avatarUrl,
    provider,
    last_login_at: now,
    updated_at: now,
  }

  const { error } = await supabase.from("profiles").upsert(
    payload,
    {
      onConflict: "user_id",
    },
  )

  if (error) {
    throw new Error(`Could not save user profile: ${error.message}`)
  }
}
