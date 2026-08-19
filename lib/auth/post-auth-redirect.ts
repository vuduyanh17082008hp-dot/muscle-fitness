import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Resolve where an authenticated user should land after login/OAuth
 * or when visiting auth-only pages while already signed in.
 */
export async function resolveAuthenticatedLandingPath(
  supabase: SupabaseClient,
  userId: string,
  requestedPath = "/dashboard",
): Promise<string> {
  if (
    requestedPath !== "/dashboard" &&
    requestedPath !== "/login" &&
    requestedPath !== "/register" &&
    requestedPath !== "/signup"
  ) {
    return requestedPath
  }

  const [profileResult, fitnessResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("fitness_profiles")
      .select("onboarding_completed")
      .eq("user_id", userId)
      .maybeSingle(),
  ])

  const onboardingCompleted = Boolean(
    fitnessResult.data?.onboarding_completed ??
      profileResult.data?.onboarding_completed,
  )

  return onboardingCompleted ? "/dashboard" : "/onboarding"
}
