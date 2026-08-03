import { redirect } from "next/navigation"

import type {
  AppRole,
  Tables,
} from "@/lib/database/types"

import { createClient } from "@/lib/supabase/server"

export type AuthenticatedUser = {
  id: string
  email: string | null
  userMetadata: Record<string, unknown>
}

export type AuthContext = {
  user: AuthenticatedUser
  profile: Tables<"profiles"> | null
}

function createAuthenticatedUser(user: {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
}): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email ?? null,
    userMetadata: user.user_metadata ?? {},
  }
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return createAuthenticatedUser(user)
}

export async function getCurrentProfile(): Promise<Tables<"profiles"> | null> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return null
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select(
      `
        user_id,
        full_name,
        avatar_url,
        date_of_birth,
        gender,
        timezone,
        role,
        onboarding_completed,
        created_at,
        updated_at
      `,
    )
    .eq("user_id", user.id)
    .maybeSingle()

  if (profileError) {
    console.error(
      "Unable to load current profile:",
      profileError,
    )

    return null
  }

  return profile
}

export async function requireUser(
  nextPath = "/dashboard",
): Promise<AuthContext> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect(
      `/login?next=${encodeURIComponent(nextPath)}`,
    )
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select(
      `
        user_id,
        full_name,
        avatar_url,
        date_of_birth,
        gender,
        timezone,
        role,
        onboarding_completed,
        created_at,
        updated_at
      `,
    )
    .eq("user_id", user.id)
    .maybeSingle()

  if (profileError) {
    console.error(
      "Unable to load authenticated profile:",
      profileError,
    )
  }

  return {
    user: createAuthenticatedUser(user),
    profile,
  }
}

export async function requireAuthenticatedUser(
  nextPath = "/dashboard",
): Promise<AuthContext> {
  return requireUser(nextPath)
}

export async function requireCompletedOnboarding(
  nextPath = "/dashboard",
): Promise<AuthContext> {
  const context = await requireUser(nextPath)

  if (!context.profile?.onboarding_completed) {
    redirect("/onboarding")
  }

  return context
}

function normalizeRole(
  role: string | null | undefined,
): AppRole {
  if (role === "admin") {
    return "admin"
  }

  if (role === "coach") {
    return "coach"
  }

  if (role === "client") {
    return "client"
  }

  return "user"
}

export async function requireRole(
  roles: AppRole[],
  nextPath = "/dashboard",
): Promise<AuthContext> {
  const context =
    await requireCompletedOnboarding(nextPath)

  const role = normalizeRole(context.profile?.role)

  if (!roles.includes(role)) {
    redirect("/unauthorized")
  }

  return context
}

export async function requireAdmin(
  nextPath = "/admin",
): Promise<AuthContext> {
  return requireRole(["admin"], nextPath)
}

export async function requireCoach(
  nextPath = "/coach",
): Promise<AuthContext> {
  return requireRole(
    ["coach", "admin"],
    nextPath,
  )
}

export async function isAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile()

  return profile?.role === "admin"
}

export async function isCoach(): Promise<boolean> {
  const profile = await getCurrentProfile()

  return (
    profile?.role === "coach" ||
    profile?.role === "admin"
  )
}