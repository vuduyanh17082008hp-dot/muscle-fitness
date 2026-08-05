import Link from "next/link"
import { redirect } from "next/navigation"
import { Home } from "lucide-react"

import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

function formatValue(
  value: string | number | null | undefined,
  suffix = "",
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Not available"
  }

  return `${value}${suffix}`
}

function formatList(
  value: string[] | null | undefined,
) {
  if (!value || value.length === 0) {
    return "Not provided"
  }

  return value.join(", ")
}

function humanize(
  value: string | null | undefined,
) {
  if (!value) {
    return "Not available"
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    )
}

function StatCard({
  label,
  value,
  description,
}: {
  label: string
  value: string | number
  description: string
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
        {label}
      </p>

      <p className="mt-3 text-3xl font-black text-white">
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-zinc-500">
        {description}
      </p>
    </article>
  )
}

function InformationRow({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/5 py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <span className="text-sm text-zinc-500">
        {label}
      </span>

      <span className="max-w-lg text-sm font-medium leading-6 text-zinc-200 sm:text-right">
        {value}
      </span>
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/dashboard")
  }

  const [
    profileResponse,
    fitnessResponse,
    preferencesResponse,
  ] = await Promise.all([
    supabase
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
      .maybeSingle(),

    supabase
      .from("fitness_profiles")
      .select(
        `
          user_id,
          height_cm,
          weight_kg,
          goal,
          experience,
          training_days,
          session_duration_minutes,
          training_location,
          available_equipment,
          priority_muscles,
          physical_limitations,
          calories_target,
          protein_target_g,
          carbs_target_g,
          fat_target_g
        `,
      )
      .eq("user_id", user.id)
      .maybeSingle(),

    supabase
      .from("user_preferences")
      .select(
        `
          user_id,
          meals_per_day,
          food_preferences,
          excluded_foods,
          allergies,
          weekly_food_budget,
          cooking_ability,
          meal_prep_frequency,
          sleep_hours,
          daily_steps,
          work_schedule,
          stress_level,
          preferred_training_time
        `,
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  if (profileResponse.error) {
    throw new Error(
      `Unable to load profile: ${profileResponse.error.message}`,
    )
  }

  if (fitnessResponse.error) {
    throw new Error(
      `Unable to load fitness profile: ${fitnessResponse.error.message}`,
    )
  }

  if (preferencesResponse.error) {
    throw new Error(
      `Unable to load preferences: ${preferencesResponse.error.message}`,
    )
  }

  const profile = profileResponse.data
  const fitness = fitnessResponse.data
  const preferences =
    preferencesResponse.data

  if (
    !profile ||
    !profile.onboarding_completed
  ) {
    redirect("/onboarding")
  }

  const displayName =
    profile.full_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Athlete"

  return (
    <main className="min-h-screen bg-[#070707] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <header className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-7 shadow-2xl shadow-black sm:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-500">
                Muscle Fitness Dashboard
              </p>

              <h1 className="mt-4 max-w-3xl text-4xl font-black uppercase tracking-tight text-white sm:text-5xl lg:text-6xl">
                Welcome back,{" "}
                <span className="text-amber-500">
                  {displayName}
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
                Your foundation is complete.
                Use your targets below to
                guide training, nutrition and
                recovery.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {/* RETURN TO HOMEPAGE BUTTON */}

              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-5 py-3 text-sm font-semibold text-amber-400 transition hover:border-amber-500/50 hover:bg-amber-500/20 hover:text-amber-300"
              >
                <Home
                  aria-hidden="true"
                  className="h-4 w-4"
                />

                Return home
              </Link>

              <Link
                href="/onboarding"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                Edit profile
              </Link>

              <Link
                href="/training"
                className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-5 py-3 text-sm font-black uppercase tracking-wider text-black transition hover:bg-amber-400"
              >
                Open training
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Calories"
            value={formatValue(
              fitness?.calories_target,
            )}
            description="Initial daily energy target."
          />

          <StatCard
            label="Protein"
            value={formatValue(
              fitness?.protein_target_g,
              " g",
            )}
            description="Daily protein target."
          />

          <StatCard
            label="Carbohydrates"
            value={formatValue(
              fitness?.carbs_target_g,
              " g",
            )}
            description="Daily carbohydrate target."
          />

          <StatCard
            label="Fat"
            value={formatValue(
              fitness?.fat_target_g,
              " g",
            )}
            description="Daily dietary fat target."
          />
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <article className="rounded-[24px] border border-white/10 bg-[#0d0d0d] p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-500">
                Training profile
              </p>

              <h2 className="mt-2 text-2xl font-bold text-white">
                Your current setup
              </h2>
            </div>

            <InformationRow
              label="Primary goal"
              value={humanize(fitness?.goal)}
            />

            <InformationRow
              label="Experience"
              value={humanize(
                fitness?.experience,
              )}
            />

            <InformationRow
              label="Height"
              value={formatValue(
                fitness?.height_cm,
                " cm",
              )}
            />

            <InformationRow
              label="Weight"
              value={formatValue(
                fitness?.weight_kg,
                " kg",
              )}
            />

            <InformationRow
              label="Training days"
              value={formatValue(
                fitness?.training_days,
                " days per week",
              )}
            />

            <InformationRow
              label="Session duration"
              value={formatValue(
                fitness?.session_duration_minutes,
                " minutes",
              )}
            />

            <InformationRow
              label="Training location"
              value={humanize(
                fitness?.training_location,
              )}
            />

            <InformationRow
              label="Priority muscles"
              value={formatList(
                fitness?.priority_muscles,
              )}
            />

            <InformationRow
              label="Available equipment"
              value={formatList(
                fitness?.available_equipment,
              )}
            />

            <InformationRow
              label="Physical limitations"
              value={
                fitness?.physical_limitations ||
                "No limitations reported"
              }
            />
          </article>

          <article className="rounded-[24px] border border-white/10 bg-[#0d0d0d] p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-500">
                Nutrition and lifestyle
              </p>

              <h2 className="mt-2 text-2xl font-bold text-white">
                Daily conditions
              </h2>
            </div>

            <InformationRow
              label="Meals per day"
              value={formatValue(
                preferences?.meals_per_day,
              )}
            />

            <InformationRow
              label="Food preferences"
              value={formatList(
                preferences?.food_preferences,
              )}
            />

            <InformationRow
              label="Excluded foods"
              value={formatList(
                preferences?.excluded_foods,
              )}
            />

            <InformationRow
              label="Allergies"
              value={formatList(
                preferences?.allergies,
              )}
            />

            <InformationRow
              label="Weekly food budget"
              value={
                preferences?.weekly_food_budget !==
                  null &&
                preferences?.weekly_food_budget !==
                  undefined
                  ? `${preferences.weekly_food_budget} SGD`
                  : "Not provided"
              }
            />

            <InformationRow
              label="Cooking ability"
              value={humanize(
                preferences?.cooking_ability,
              )}
            />

            <InformationRow
              label="Meal-prep frequency"
              value={humanize(
                preferences?.meal_prep_frequency,
              )}
            />

            <InformationRow
              label="Sleep"
              value={formatValue(
                preferences?.sleep_hours,
                " hours",
              )}
            />

            <InformationRow
              label="Daily steps"
              value={formatValue(
                preferences?.daily_steps,
              )}
            />

            <InformationRow
              label="Stress level"
              value={humanize(
                preferences?.stress_level,
              )}
            />

            <InformationRow
              label="Preferred training time"
              value={humanize(
                preferences?.preferred_training_time,
              )}
            />

            <InformationRow
              label="School/work schedule"
              value={
                preferences?.work_schedule ||
                "Not provided"
              }
            />
          </article>
        </section>
      </div>
    </main>
  )
}