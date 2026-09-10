"use client"

import { useId, useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { CheckCircle2, Loader2, XCircle } from "lucide-react"

import {
  DB_ACTIVITY_LEVEL_OVERRIDE_LABELS,
  DB_NUTRITION_GOAL_OVERRIDE_LABELS,
  DB_TRAINING_MODE_OVERRIDE_LABELS,
  type DbActivityLevelOverride,
  type DbNutritionGoalOverride,
  type DbTrainingModeOverride,
} from "@/lib/nutrition/profile-mapping"

import { updateNutritionSettingsAction } from "./actions"

type NutritionSettingsFormProps = {
  trainingModeOverride: DbTrainingModeOverride
  activityLevelOverride: DbActivityLevelOverride
  goalOverride: DbNutritionGoalOverride | "auto"
}

type SaveState = "idle" | "saving" | "success" | "error"

const TRAINING_MODES = Object.keys(
  DB_TRAINING_MODE_OVERRIDE_LABELS,
) as DbTrainingModeOverride[]

const ACTIVITY_LEVELS = Object.keys(
  DB_ACTIVITY_LEVEL_OVERRIDE_LABELS,
) as DbActivityLevelOverride[]

const GOAL_OVERRIDES = Object.keys(
  DB_NUTRITION_GOAL_OVERRIDE_LABELS,
) as DbNutritionGoalOverride[]

export function NutritionSettingsForm({
  trainingModeOverride,
  activityLevelOverride,
  goalOverride,
}: NutritionSettingsFormProps) {
  const router = useRouter()

  const trainingModeId = useId()
  const activityLevelId = useId()
  const goalOverrideId = useId()

  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setSaveState("saving")
    setMessage(null)

    startTransition(async () => {
      const result = await updateNutritionSettingsAction(formData)

      setSaveState(result.success ? "success" : "error")
      setMessage(result.message)

      if (result.success) {
        // The server action already revalidates both routes; refresh
        // this client tree too so the numbers update without a manual
        // reload, and so a real browser refresh reads the same saved
        // values back from the database (not just React state).
        router.refresh()
      }
    })
  }

  return (
    <form action={handleSubmit} className="grid gap-4 sm:grid-cols-3">
      <div>
        <label
          htmlFor={trainingModeId}
          className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500"
        >
          Training style
        </label>

        <select
          id={trainingModeId}
          name="trainingModeOverride"
          defaultValue={trainingModeOverride}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm font-medium text-white outline-none transition focus:border-amber-400/40"
        >
          {TRAINING_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {DB_TRAINING_MODE_OVERRIDE_LABELS[mode]}
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
          name="activityLevelOverride"
          defaultValue={activityLevelOverride}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm font-medium text-white outline-none transition focus:border-amber-400/40"
        >
          {ACTIVITY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {DB_ACTIVITY_LEVEL_OVERRIDE_LABELS[level]}
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
          {GOAL_OVERRIDES.map((goal) => (
            <option key={goal} value={goal}>
              {DB_NUTRITION_GOAL_OVERRIDE_LABELS[goal]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saveState === "saving" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          {saveState === "saving" ? "Saving…" : "Update nutrition plan"}
        </button>

        {saveState === "success" && message ? (
          <p
            role="status"
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400"
          >
            <CheckCircle2 className="size-3.5" />
            {message}
          </p>
        ) : null}

        {saveState === "error" && message ? (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-xs font-semibold text-red-400"
          >
            <XCircle className="size-3.5" />
            {message}
          </p>
        ) : null}
      </div>
    </form>
  )
}
