import { cache } from "react"

import { createTypedClient } from "@/lib/supabase/server"

export type AccountProfile = {
  id: string
  email: string | null
  full_name: string
  username: string | null
  avatar_url: string | null
  phone: string | null
  date_of_birth: string | null
  gender: string | null
  timezone: string
  provider: string | null
  onboarding_completed: boolean
  last_login_at: string | null
  created_at: string | null
  updated_at: string | null
}

/** Columns that exist on public.fitness_profiles (canonical: session_duration_minutes). */
export type AccountFitnessProfile = {
  user_id: string
  height_cm: number | null
  weight_kg: number | null
  goal: string | null
  experience: string | null
  training_days: number | null
  session_duration_minutes: number | null
}

/**
 * profile: ok | not_found (no row yet) | error (DB read failed)
 * fitness: ok | not_created (valid: row is created lazily) | error (DB read failed)
 */
export type AccountReadStatus = {
  profile: "ok" | "not_found" | "error"
  fitness: "ok" | "not_created" | "error"
}

export type CurrentAccount = {
  user: {
    id: string
    email: string | null
    createdAt: string | null
  }
  profile: AccountProfile
  fitnessProfile: AccountFitnessProfile | null
  readStatus: AccountReadStatus
}

function readString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim()
  }

  return null
}

function readNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function getEmailUsername(
  email: string | null | undefined,
): string | null {
  if (!email) {
    return null
  }

  return email.split("@")[0] || null
}

async function loadCurrentAccount(): Promise<CurrentAccount | null> {
  const supabase = await createTypedClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return null
  }

  const [profileResult, fitnessResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "user_id, email, full_name, username, avatar_url, phone, date_of_birth, gender, timezone, provider, onboarding_completed, last_login_at, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("fitness_profiles")
      .select(
        "user_id, height_cm, weight_kg, goal, experience, training_days, session_duration_minutes",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  if (profileResult.error) {
    console.error("Profile query error:", profileResult.error)
  }

  if (fitnessResult.error) {
    console.error("Fitness profile query error:", fitnessResult.error)
  }

  const metadata = user.user_metadata as Record<string, unknown>
  const emailUsername = getEmailUsername(user.email)

  const fallbackName =
    readString(metadata.full_name) ??
    readString(metadata.name) ??
    readString(metadata.display_name) ??
    emailUsername ??
    "Muscle Fitness Client"

  const fallbackUsername =
    readString(metadata.username) ??
    readString(metadata.preferred_username) ??
    emailUsername

  const fallbackAvatar =
    readString(metadata.avatar_url) ??
    readString(metadata.picture)

  const databaseProfile = profileResult.data

  const profile: AccountProfile = {
    id: user.id,
    email:
      readString(databaseProfile?.email) ??
      user.email ??
      null,
    full_name:
      readString(databaseProfile?.full_name) ||
      fallbackName,
    username:
      readString(databaseProfile?.username) ??
      fallbackUsername,
    avatar_url:
      readString(databaseProfile?.avatar_url) ??
      fallbackAvatar,
    phone: readString(databaseProfile?.phone),
    date_of_birth: readString(databaseProfile?.date_of_birth),
    gender: readString(databaseProfile?.gender),
    onboarding_completed: databaseProfile?.onboarding_completed ?? false,
    timezone: readString(databaseProfile?.timezone) ?? "UTC",
    provider:
      readString(databaseProfile?.provider) ??
      readString(user.app_metadata?.provider) ??
      "email",
    last_login_at: readString(databaseProfile?.last_login_at),
    created_at:
      readString(databaseProfile?.created_at) ??
      user.created_at ??
      null,
    updated_at: readString(databaseProfile?.updated_at),
  }

  const databaseFitness = fitnessResult.data

  const fitnessProfile: AccountFitnessProfile | null =
    databaseFitness
      ? {
          user_id: user.id,
          height_cm: readNumber(databaseFitness.height_cm),
          weight_kg: readNumber(databaseFitness.weight_kg),
          goal: readString(databaseFitness.goal),
          experience: readString(databaseFitness.experience),
          training_days: readNumber(databaseFitness.training_days),
          session_duration_minutes: readNumber(
            databaseFitness.session_duration_minutes,
          ),
        }
      : null

  const readStatus: AccountReadStatus = {
    profile: profileResult.error
      ? "error"
      : databaseProfile
        ? "ok"
        : "not_found",
    fitness: fitnessResult.error
      ? "error"
      : databaseFitness
        ? "ok"
        : "not_created",
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at ?? null,
    },
    profile,
    fitnessProfile,
    readStatus,
  }
}

export const getCurrentAccount = cache(loadCurrentAccount)
