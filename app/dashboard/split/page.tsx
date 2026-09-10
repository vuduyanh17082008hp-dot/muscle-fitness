import Link from "next/link"
import { redirect } from "next/navigation"

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Dumbbell,
  Layers3,
  Moon,
} from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { getSplitTargets } from "@/lib/training/program-engine"
import {
  DEFAULT_TRAINING_PREFERENCES,
  type MuscleGroup,
  type TrainingPreferences,
} from "@/lib/training/types"

export const dynamic = "force-dynamic"

/* =========================================================
   TYPES
========================================================= */

type RawTrainingPreferencesRow = {
  split_type: TrainingPreferences["splitType"]
  training_days: number
  custom_split: TrainingPreferences["customSplit"]
  priority_muscles: string[]
} | null

/* =========================================================
   HELPERS
========================================================= */

function isMuscleGroup(value: string): value is MuscleGroup {
  return (
    [
      "Chest",
      "Upper Chest",
      "Back Width",
      "Back Thickness",
      "Side Delts",
      "Rear Delts",
      "Quads",
      "Hamstrings",
      "Glutes",
      "Biceps",
      "Triceps",
      "Calves",
      "Abs",
    ] as const
  ).includes(value as MuscleGroup)
}

function buildPreferences(
  row: RawTrainingPreferencesRow,
  fallbackTrainingDays: number,
): { preferences: TrainingPreferences; isSaved: boolean } {
  if (!row) {
    return {
      preferences: {
        ...DEFAULT_TRAINING_PREFERENCES,
        trainingDays: fallbackTrainingDays,
      },
      isSaved: false,
    }
  }

  return {
    preferences: {
      ...DEFAULT_TRAINING_PREFERENCES,
      splitType: row.split_type,
      trainingDays: row.training_days,
      customSplit: row.custom_split ?? [],
      priorityMuscles: (row.priority_muscles ?? []).filter(isMuscleGroup),
    },
    isSaved: true,
  }
}

/* =========================================================
   PAGE
========================================================= */

export default async function TrainingSplitPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/dashboard/split")
  }

  const [trainingPreferencesResponse, fitnessResponse] = await Promise.all([
    supabase
      .from("training_preferences")
      .select("split_type, training_days, custom_split, priority_muscles")
      .eq("user_id", user.id)
      .maybeSingle(),

    supabase
      .from("fitness_profiles")
      .select("training_days")
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  if (trainingPreferencesResponse.error) {
    console.warn(
      "[SPLIT] Unable to load training_preferences:",
      trainingPreferencesResponse.error.message,
    )
  }

  const fallbackTrainingDays = fitnessResponse.data?.training_days ?? 3

  const { preferences, isSaved } = buildPreferences(
    (trainingPreferencesResponse.data ?? null) as RawTrainingPreferencesRow,
    fallbackTrainingDays,
  )

  const dayTargets = getSplitTargets(preferences)

  const totalDaysInWeek = 7
  const restDaysCount = Math.max(
    0,
    totalDaysInWeek - dayTargets.length,
  )

  const weeklyRows = [
    ...dayTargets.map((day, index) => ({
      label: `Day ${index + 1}`,
      title: day.title,
      muscles: day.muscles,
      isRest: false,
    })),
    ...Array.from({ length: restDaysCount }, (_, index) => ({
      label: `Day ${dayTargets.length + index + 1}`,
      title: "Recovery",
      muscles: [] as MuscleGroup[],
      isRest: true,
    })),
  ]

  const muscleFrequency = new Map<MuscleGroup, number>()

  for (const day of dayTargets) {
    for (const muscle of day.muscles) {
      muscleFrequency.set(muscle, (muscleFrequency.get(muscle) ?? 0) + 1)
    }
  }

  const sortedFrequency = Array.from(muscleFrequency.entries()).sort(
    (a, b) => b[1] - a[1],
  )

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      {/* ===================================================
          HEADER
      =================================================== */}

      <header className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-7 sm:p-9">
        <span className="inline-grid size-14 place-items-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
          <Layers3 className="size-6" />
        </span>

        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
          Weekly Structure
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Training Split
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          How your training week is structured across muscle groups —
          separate from the exercise-by-exercise detail in your{" "}
          <Link
            href="/dashboard/workouts"
            className="text-amber-300 underline decoration-amber-300/40 underline-offset-4 hover:text-amber-200"
          >
            Training Plan
          </Link>
          .
        </p>

        {!isSaved ? (
          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-zinc-500">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            No saved split configuration was found, so this structure is
            generated from your onboarding training days ({fallbackTrainingDays}
            /week) using the default auto split. Configure a split in{" "}
            <Link
              href="/training"
              className="text-amber-300 underline decoration-amber-300/40 underline-offset-4 hover:text-amber-200"
            >
              Training Preferences
            </Link>{" "}
            to personalise this page.
          </p>
        ) : null}
      </header>

      {/* ===================================================
          WEEKLY STRUCTURE
      =================================================== */}

      <section>
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
            <CalendarDays className="size-5" />
          </span>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-500">
              Weekly Structure
            </p>
            <h2 className="text-xl font-bold text-white">
              {dayTargets.length} training {dayTargets.length === 1 ? "day" : "days"} · {restDaysCount}{" "}
              recovery {restDaysCount === 1 ? "day" : "days"}
            </h2>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {weeklyRows.map((row) => (
            <div
              key={row.label}
              className={`flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${
                row.isRest
                  ? "border-white/5 bg-white/[0.015]"
                  : "border-white/10 bg-[#0d0d0d]"
              }`}
            >
              <div className="flex items-center gap-4">
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-xl border text-xs font-black uppercase ${
                    row.isRest
                      ? "border-white/10 bg-white/5 text-zinc-500"
                      : "border-amber-400/20 bg-amber-400/10 text-amber-300"
                  }`}
                >
                  {row.isRest ? <Moon className="size-4" /> : <Dumbbell className="size-4" />}
                </span>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    {row.label}
                  </p>
                  <p className="text-base font-bold text-white">{row.title}</p>
                </div>
              </div>

              {row.muscles.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                  {row.muscles.map((muscle) => (
                    <span
                      key={muscle}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-zinc-300"
                    >
                      {muscle}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">Rest day — no scheduled training.</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ===================================================
          WEEKLY MUSCLE-GROUP FREQUENCY
      =================================================== */}

      <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-6 sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-500">
          Weekly Muscle-Group Frequency
        </p>

        <h2 className="mt-2 text-xl font-bold text-white">
          {dayTargets.length} total weekly sessions
        </h2>

        {sortedFrequency.length > 0 ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sortedFrequency.map(([muscle, count]) => (
              <div
                key={muscle}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5"
              >
                <span className="text-sm font-medium text-zinc-300">
                  {muscle}
                </span>
                <span className="text-sm font-black text-amber-300">
                  {count}×/week
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">
            No muscle groups scheduled yet.
          </p>
        )}

        <Link
          href="/dashboard/workouts"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-amber-400 transition hover:text-amber-300"
        >
          View exercise-by-exercise Training Plan
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  )
}
