"use client"

import { useId, useState, useTransition } from "react"

import {
  ACTIVITY_LEVEL_LABELS,
  NUTRITION_GOAL_LABELS,
  TRAINING_MODE_LABELS,
  type ActivityLevel,
  type NutritionGoal,
  type TrainingMode,
} from "@/lib/nutrition/plan"

import { updateNutritionSettingsAction } from "./actions"

type NutritionSettingsFormProps = {
  trainingMode: TrainingMode
  activityLevel: ActivityLevel
  goalOverride: NutritionGoal | "auto"
}

const TRAINING_MODES = Object.keys(TRAINING_MODE_LABELS) as TrainingMode[]
const ACTIVITY_LEVELS = Object.keys(ACTIVITY_LEVEL_LABELS) as ActivityLevel[]
const GOAL_OVERRIDES: Array<NutritionGoal | "auto"> = [
  "auto",
  "fat_loss",
  "maintenance",
  "lean_bulk",
]

export function NutritionSettingsForm({
  trainingMode,
  activityLevel,
  goalOverride,
}: NutritionSettingsFormProps) {
  const trainingModeId = useId()
  const activityLevelId = useId()
  const goalOverrideId = useId()

  const [status, setStatus] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateNutritionSettingsAction(formData)
      setStatus(result.message)
    })
  }

  return (
    <form
      action={handleSubmit}
      className="grid gap-4 sm:grid-cols-3"
    >
      <div>
        <label
          htmlFor={trainingModeId}
          className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500"
        >
          Training style
        </label>

        <select
          id={trainingModeId}
          name="trainingMode"
          defaultValue={trainingMode}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm font-medium text-white outline-none transition focus:border-amber-400/40"
        >
          {TRAINING_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {TRAINING_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor={activityLevelId}
          className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500"
        >
          Activity level
        </label>

        <select
          id={activityLevelId}
          name="activityLevel"
          defaultValue={activityLevel}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm font-medium text-white outline-none transition focus:border-amber-400/40"
        >
          {ACTIVITY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {ACTIVITY_LEVEL_LABELS[level]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor={goalOverrideId}
          className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500"
        >
          Goal
        </label>

        <select
          id={goalOverrideId}
          name="goalOverride"
          defaultValue={goalOverride}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm font-medium text-white outline-none transition focus:border-amber-400/40"
        >
          <option value="auto">Use onboarding goal</option>
          {GOAL_OVERRIDES.filter(
            (value): value is NutritionGoal => value !== "auto",
          ).map((goal) => (
            <option key={goal} value={goal}>
              {NUTRITION_GOAL_LABELS[goal]}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Update nutrition plan"}
        </button>

        {status ? (
          <p className="text-xs text-zinc-400" role="status">
            {status}
          </p>
        ) : null}
      </div>
    </form>
  )
}
