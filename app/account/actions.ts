"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import {
  GENDER_VALUES,
  GOAL_VALUES,
  isValidDateOfBirth,
  isValidTimezone,
} from "@/lib/account/profile-contract"
import { createTypedClient } from "@/lib/supabase/server"

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
  /** Submitted values echoed back on failure so the form keeps the user's input. */
  values?: Partial<Record<ProfileFieldName, string>>
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

/** null = blank, NaN = present but not a number (rejected, never silently dropped). */
function getNumber(
  formData: FormData,
  fieldName: string
): number | null {
  const value = getString(formData, fieldName)

  return value === null ? null : Number(value)
}

function createErrorState(
  message: string,
  fieldErrors: SaveProfileState["fieldErrors"] = {},
  values?: SaveProfileState["values"]
): SaveProfileState {
  return {
    success: false,
    message,
    fieldErrors,
    values,
  }
}

export async function saveProfileAction(
  _previousState: SaveProfileState,
  formData: FormData
): Promise<SaveProfileState> {
  const supabase = await createTypedClient()

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

  const values: NonNullable<SaveProfileState["values"]> = {}
  for (const key of [
    "full_name",
    "username",
    "phone",
    "date_of_birth",
    "gender",
    "height_cm",
    "weight_kg",
    "timezone",
    "goal",
  ] as const) {
    values[key] = String(formData.get(key) ?? "")
  }

  const fieldErrors: SaveProfileState["fieldErrors"] = {}

  if (!fullName) {
    fieldErrors.full_name = "Full name is required."
  } else if (fullName.length > 100) {
    fieldErrors.full_name = "Full name must be 100 characters or fewer."
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

  if (dateOfBirth && !isValidDateOfBirth(dateOfBirth)) {
    fieldErrors.date_of_birth = "Enter a valid date of birth."
  }

  if (!isValidTimezone(timezone)) {
    fieldErrors.timezone = "Invalid timezone."
  }

  if (
    heightCm !== null &&
    (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 260)
  ) {
    fieldErrors.height_cm =
      "Height must be between 80 and 260 cm."
  }

  if (
    weightKg !== null &&
    (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 400)
  ) {
    fieldErrors.weight_kg =
      "Weight must be between 20 and 400 kg."
  }

  if (gender && !GENDER_VALUES.has(gender)) {
    fieldErrors.gender = "Invalid gender selection."
  }

  if (goal && !GOAL_VALUES.has(goal)) {
    fieldErrors.goal = "Invalid fitness goal."
  }

  if (Object.keys(fieldErrors).length > 0) {
    return createErrorState(
      "Please correct the highlighted information.",
      fieldErrors,
      values
    )
  }

  // One RPC = one transaction: profiles + fitness_profiles commit together or not at all.
  const { error: saveError } = await supabase.rpc(
    "save_account_profile",
    {
      p_payload: {
        full_name: fullName,
        username,
        phone,
        date_of_birth: dateOfBirth,
        gender,
        timezone,
        height_cm: heightCm,
        weight_kg: weightKg,
        goal,
      },
    }
  )

  if (saveError) {
    console.error("Account save error:", saveError)

    return createErrorState(
      saveError.code === "42501"
        ? "Your session has expired. Please sign in again."
        : saveError.code && /^(22|23)/.test(saveError.code)
          ? "One of the values was rejected. Please check your details and try again."
          : "We couldn't save your changes. Nothing was updated — please try again.",
      {},
      values
    )
  }

  // Auth metadata is only a display-name fallback (profiles is authoritative) and lives in a
  // different service, so it cannot join the transaction. Best effort; never reported as a failed save.
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
      "Auth metadata update error (profile already saved):",
      authMetadataError
    )
  }

  revalidatePath("/account")
  revalidatePath("/account/edit")
  revalidatePath("/dashboard")
  revalidatePath("/", "layout")

  redirect("/account?updated=1")
}
