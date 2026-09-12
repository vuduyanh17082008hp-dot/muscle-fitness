import "server-only"

import type { SupabaseClient, User } from "@supabase/supabase-js"

/**
 * Shared OAuth/email code-exchange handler.
 *
 * Two routes historically implemented this independently
 * (app/auth/callback/route.ts — the one every internal link actually
 * points at — and app/callback/route.ts, an orphaned duplicate kept
 * only in case it's still registered as a Supabase Auth redirect URL
 * externally). They had drifted: only the orphaned one synced the
 * user's profile row after login. This is the single implementation
 * both now call, so a real login path never again silently skips
 * profile sync depending on which URL happened to receive the
 * redirect.
 */
export type OAuthCallbackResult =
  | { success: true; user: User }
  | { success: false; errorMessage: string }

export async function handleOAuthCallback(
  supabase: SupabaseClient,
  code: string,
): Promise<OAuthCallbackResult> {
  const { data: sessionData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    console.error("[OAUTH CALLBACK] exchangeCodeForSession failed", exchangeError.message)
    return { success: false, errorMessage: exchangeError.message }
  }

  let user: User | null = sessionData.user ?? null

  // Some providers/flows don't return the user directly from the
  // exchange — re-read it from the session cookie that was just set.
  if (!user) {
    const { data: currentUserData, error: currentUserError } = await supabase.auth.getUser()

    if (currentUserError) {
      console.error("[OAUTH CALLBACK] could not read user after exchange", currentUserError.message)
    }

    user = currentUserData.user
  }

  if (!user) {
    return {
      success: false,
      errorMessage: "Authentication succeeded but the user account could not be loaded.",
    }
  }

  // Profile sync failure must never cost the user their session —
  // log and continue.
  try {
    const { syncAuthUserProfile } = await import("@/lib/auth/profile")
    await syncAuthUserProfile(supabase, user)
  } catch (profileError) {
    console.error("[OAUTH CALLBACK] profile sync failed", profileError)
  }

  return { success: true, user }
}
