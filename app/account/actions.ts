"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export type ProfileFieldName =
  | "full_name"
  | "username"
  | "phone"
  | "date_of_birth"
  | "gender"
  | "height_cm"
  | "weight_kg"
  | "timezone"
  | "goal"

export type SaveProfileState = {
  success: boolean
  message: string | null
  fieldErrors: Partial<Record<ProfileFieldName, string>>
}

function getString(
  formData: FormData,
  fieldName: string
): string | null {
  const value = formData.get(fieldName)

  if (typeof value !== "string") {
    return null
  }

  const cleanedValue = value.trim()

  return cleanedValue.length > 0 ? cleanedValue : null
}

function getNumber(
  formData: FormData,
  fieldName: string
): number | null {
  const value = getString(formData, fieldName)

  if (value === null) {
    return null
  }

  const number = Number(value)

  return Number.isFinite(number) ? number : null
}

function createErrorState(
  message: string,
  fieldErrors: SaveProfileState["fieldErrors"] = {}
): SaveProfileState {
  return {
    success: false,
    message,
    fieldErrors,
  }
}

export async function saveProfileAction(
  _previousState: SaveProfileState,
  formData: FormData
): Promise<SaveProfileState> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return createErrorState(
      "Your session has expired. Please sign in again."
    )
  }

  const fullName = getString(formData, "full_name")
  const username = getString(formData, "username")
  const phone = getString(formData, "phone")
  const dateOfBirth = getString(formData, "date_of_birth")
  const gender = getString(formData, "gender")
  const heightCm = getNumber(formData, "height_cm")
  const weightKg = getNumber(formData, "weight_kg")
  const timezone =
    getString(formData, "timezone") ?? "Asia/Singapore"
  const goal = getString(formData, "goal")

  const fieldErrors: SaveProfileState["fieldErrors"] = {}

  if (!fullName) {
    fieldErrors.full_name = "Full name is required."
  }

  if (
    username &&
    !/^[a-zA-Z0-9._-]{3,30}$/.test(username)
  ) {
    fieldErrors.username =
      "Username must contain 3–30 letters, numbers, dots, underscores or hyphens."
  }

  if (phone && phone.length > 30) {
    fieldErrors.phone = "Phone number is too long."
  }

  if (
    heightCm !== null &&
    (heightCm < 80 || heightCm > 260)
  ) {
    fieldErrors.height_cm =
      "Height must be between 80 and 260 cm."
  }

  if (
    weightKg !== null &&
    (weightKg < 20 || weightKg > 400)
  ) {
    fieldErrors.weight_kg =
      "Weight must be between 20 and 400 kg."
  }

  const allowedGenders = new Set([
    "male",
    "female",
    "other",
    "prefer_not_to_say",
  ])

  if (gender && !allowedGenders.has(gender)) {
    fieldErrors.gender = "Invalid gender selection."
  }

  const allowedGoals = new Set([
    "fat_loss",
    "lean_bulk",
    "muscle_gain",
    "body_recomposition",
    "maintenance",
    "performance",
  ])

  if (goal && !allowedGoals.has(goal)) {
    fieldErrors.goal = "Invalid fitness goal."
  }

  if (Object.keys(fieldErrors).length > 0) {
    return createErrorState(
      "Please correct the highlighted information.",
      fieldErrors
    )
  }

  const now = new Date().toISOString()

  const { error: authMetadataError } =
    await supabase.auth.updateUser({
      data: {
        full_name: fullName,
        name: fullName,
        username,
      },
    })

  if (authMetadataError) {
    console.error(
      "Auth metadata update error:",
      authMetadataError
    )

    return createErrorState(authMetadataError.message)
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        full_name: fullName,
        username,
        phone,
        updated_at: now,
      },
      {
        onConflict: "id",
      }
    )

  if (profileError) {
    console.error("Profile update error:", profileError)

    return createErrorState(profileError.message)
  }

  const { error: fitnessError } = await supabase
    .from("fitness_profiles")
    .upsert(
      {
        user_id: user.id,
        date_of_birth: dateOfBirth,
        gender,
        height_cm: heightCm,
        weight_kg: weightKg,
        timezone,
        goal,
        updated_at: now,
      },
      {
        onConflict: "user_id",
      }
    )

  if (fitnessError) {
    console.error(
      "Fitness profile update error:",
      fitnessError
    )

    return createErrorState(fitnessError.message)
  }

  revalidatePath("/account")
  revalidatePath("/account/edit")
  revalidatePath("/dashboard")
  revalidatePath("/", "layout")

  redirect("/account?updated=1")
}