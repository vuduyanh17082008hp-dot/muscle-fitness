/**
 * Account profile field contract (DB-02-01). Values are the exact stored enum values of
 * public.gender_type / public.fitness_goal; labels are display-only, nothing is converted on submit.
 */
export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const

export const GOAL_OPTIONS = [
  { value: "fat_loss", label: "Fat loss" },
  { value: "lean_bulk", label: "Lean bulk" },
  { value: "muscle_gain", label: "Muscle gain" },
  { value: "body_recomposition", label: "Body recomposition" },
  { value: "maintenance", label: "Maintenance" },
  { value: "performance", label: "Performance" },
] as const

export const GENDER_VALUES: ReadonlySet<string> = new Set(
  GENDER_OPTIONS.map((option) => option.value),
)
export const GOAL_VALUES: ReadonlySet<string> = new Set(
  GOAL_OPTIONS.map((option) => option.value),
)

export function labelFor(
  options: readonly { value: string; label: string }[],
  value: string | null | undefined,
): string | null {
  if (!value) return null
  return options.find((option) => option.value === value)?.label ?? value
}

export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** YYYY-MM-DD that is a real calendar date, not in the future. */
export function isValidDateOfBirth(value: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getTime() <= now.getTime() &&
    Number(value.slice(0, 4)) >= 1900
  )
}
