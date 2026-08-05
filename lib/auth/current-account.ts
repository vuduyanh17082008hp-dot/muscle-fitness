import { cache } from "react"

import { createClient } from "@/lib/supabase/server"

export type AccountProfile = {
  id: string
  email: string | null
  full_name: string
  username: string | null
  avatar_url: string | null
  phone: string | null
  provider: string | null
  last_login_at: string | null
  created_at: string | null
  updated_at: string | null
}

export type AccountFitnessProfile = {
  user_id: string
  date_of_birth: string | null
  gender: string | null
  height_cm: number | null
  weight_kg: number | null
  timezone: string | null
  goal: string | null
  experience: string | null
  training_days: number | null
  session_duration: number | null
  onboarding_completed: boolean
}

export type CurrentAccount = {
  user: {
    id: string
    email: string | null
    createdAt: string | null
  }
  profile: AccountProfile
  fitnessProfile: AccountFitnessProfile | null
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
  const supabase = await createClient()

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
      .select(`
        user_id,
        email,
        full_name,
        username,
        avatar_url,
        phone,
        provider,
        last_login_at,
        created_at,
        updated_at,
        onboarding_completed
      `)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("fitness_profiles")
      .select(`
        user_id,
        date_of_birth,
        gender,
        height_cm,
        weight_kg,
        current_weight_kg,
        timezone,
        goal,
        experience,
        training_experience,
        training_days,
        session_duration,
        session_duration_minutes,
        onboarding_completed
      `)
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

  const databaseProfile = profileResult.data as Record<
    string,
    unknown
  > | null

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

  const databaseFitness = fitnessResult.data as Record<
    string,
    unknown
  > | null

  const fitnessProfile: AccountFitnessProfile | null =
    databaseFitness
      ? {
          user_id: user.id,
          date_of_birth: readString(
            databaseFitness.date_of_birth,
          ),
          gender: readString(databaseFitness.gender),
          height_cm: readNumber(databaseFitness.height_cm),
          weight_kg:
            readNumber(databaseFitness.weight_kg) ??
            readNumber(databaseFitness.current_weight_kg),
          timezone:
            readString(databaseFitness.timezone) ?? "UTC",
          goal: readString(databaseFitness.goal),
          experience:
            readString(databaseFitness.experience) ??
            readString(databaseFitness.training_experience),
          training_days: readNumber(
            databaseFitness.training_days,
          ),
          session_duration:
            readNumber(databaseFitness.session_duration) ??
            readNumber(
              databaseFitness.session_duration_minutes,
            ),
          onboarding_completed: Boolean(
            databaseFitness.onboarding_completed ??
              databaseProfile?.onboarding_completed,
          ),
        }
      : null

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at ?? null,
    },
    profile,
    fitnessProfile,
  }
}

export const getCurrentAccount = cache(loadCurrentAccount)
