"use client"

import { useId, useState, useTransition, type FormEvent } from "react"

import { useRouter } from "next/navigation"

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react"

import {
  DB_ACTIVITY_LEVEL_OVERRIDE_LABELS,
  DB_NUTRITION_GOAL_OVERRIDE_LABELS,
  DB_TRAINING_MODE_OVERRIDE_LABELS,
  dbActivityOverrideToEngine,
  dbGoalOverrideToEngine,
  type DbActivityLevelOverride,
  type DbNutritionGoalOverride,
  type DbTrainingModeOverride,
} from "@/lib/nutrition/profile-mapping"
import {
  ACTIVITY_LEVEL_DESCRIPTIONS,
  NUTRITION_GOAL_DESCRIPTIONS,
  NUTRITION_GOAL_LABELS,
  activityConsistencyNote,
  getPalMultiplier,
  type NutritionGoal,
} from "@/lib/nutrition/plan"

import { updateNutritionSettingsAction } from "./actions"

type NutritionSettingsFormProps = {
  trainingModeOverride: DbTrainingModeOverride
  activityLevelOverride: DbActivityLevelOverride
  goalOverride: DbNutritionGoalOverride | "auto"
  /** What "Use onboarding goal" resolves to right now. */
  onboardingGoal: NutritionGoal
  trainingVolume: { daysPerWeek: number | null; sessionMinutes: number | null }
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

const SELECT_CLASS =
  "w-full rounded-xl border border-mf-glass-border bg-mf-glass-bg-deep px-3.5 py-3 text-base font-medium text-mf-glass-text outline-none transition focus:border-mf-glass-brand-border"
const LABEL_CLASS =
  "mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-mf-glass-text-muted"
const HELP_CLASS = "mt-2 text-xs leading-5 text-mf-glass-text-muted"

/**
 * Controlled selects + onSubmit (not `<form action>`): React 19 resets
 * an uncontrolled `<form action>` after it runs, which snapped the
 * selects back to the PREVIOUS saved values while the numbers below
 * already showed the new ones (the 3,760 kcal "Maintenance" report).
 */
export function NutritionSettingsForm({
  trainingModeOverride,
  activityLevelOverride,
  goalOverride,
  onboardingGoal,
  trainingVolume,
}: NutritionSettingsFormProps) {
  const router = useRouter()

  const trainingModeId = useId()
  const activityLevelId = useId()
  const goalOverrideId = useId()

  const [trainingMode, setTrainingMode] = useState(trainingModeOverride)
  const [activityLevel, setActivityLevel] = useState(activityLevelOverride)
  const [goal, setGoal] = useState(goalOverride)

  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Last values the SERVER confirmed (props until the first save succeeds).
  const [confirmed, setConfirmed] = useState({ trainingMode: trainingModeOverride, activityLevel: activityLevelOverride, goal: goalOverride })

  const dirty =
    trainingMode !== confirmed.trainingMode ||
    activityLevel !== confirmed.activityLevel ||
    goal !== confirmed.goal

  const engineActivity = dbActivityOverrideToEngine(activityLevel)
  const engineGoal = goal === "auto" ? onboardingGoal : dbGoalOverrideToEngine(goal)
  const activityNote = activityConsistencyNote(engineActivity, trainingVolume)

  function edit<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      if (saveState !== "saving") {
        setSaveState("idle")
        setMessage(null)
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const submitted = { trainingMode, activityLevel, goal }
    setSaveState("saving")
    setMessage(null)

    startTransition(async () => {
      const result = await updateNutritionSettingsAction(formData)

      setSaveState(result.success ? "success" : "error")
      setMessage(result.message)

      if (result.success) {
        setConfirmed(submitted)
        // Server confirmed: pull the recomputed plan. A browser refresh
        // reads the same saved values back from the database.
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-3">
      <div>
        <label htmlFor={trainingModeId} className={LABEL_CLASS}>
          Training style
        </label>

        <select
          id={trainingModeId}
          name="trainingModeOverride"
          value={trainingMode}
          onChange={(e) => edit(setTrainingMode)(e.target.value as DbTrainingModeOverride)}
          className={SELECT_CLASS}
        >
          {TRAINING_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {DB_TRAINING_MODE_OVERRIDE_LABELS[mode]}
            </option>
          ))}
        </select>

        <p className={HELP_CLASS}>
          How you train. Shapes macros and meal timing — it never changes your calories.
        </p>
      </div>

      <div>
        <label htmlFor={activityLevelId} className={LABEL_CLASS}>
          Activity level
        </label>

        <select
          id={activityLevelId}
          name="activityLevelOverride"
          value={activityLevel}
          onChange={(e) => edit(setActivityLevel)(e.target.value as DbActivityLevelOverride)}
          aria-describedby={`${activityLevelId}-help`}
          className={SELECT_CLASS}
        >
          {ACTIVITY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {DB_ACTIVITY_LEVEL_OVERRIDE_LABELS[level]} (×{getPalMultiplier(dbActivityOverrideToEngine(level))})
            </option>
          ))}
        </select>

        <p id={`${activityLevelId}-help`} className={HELP_CLASS}>
          {ACTIVITY_LEVEL_DESCRIPTIONS[engineActivity]} Count your whole day — job, walking and
          training. The multiplier already includes exercise; nothing is added on top.
        </p>
      </div>

      <div>
        <label htmlFor={goalOverrideId} className={LABEL_CLASS}>
          Goal
        </label>

        <select
          id={goalOverrideId}
          name="goalOverride"
          value={goal}
          onChange={(e) => edit(setGoal)(e.target.value as DbNutritionGoalOverride | "auto")}
          className={SELECT_CLASS}
        >
          <option value="auto">
            Use onboarding goal ({NUTRITION_GOAL_LABELS[onboardingGoal]})
          </option>
          {GOAL_OVERRIDES.map((option) => (
            <option key={option} value={option}>
              {DB_NUTRITION_GOAL_OVERRIDE_LABELS[option]}
            </option>
          ))}
        </select>

        <p className={HELP_CLASS}>{NUTRITION_GOAL_DESCRIPTIONS[engineGoal]}</p>
      </div>

      {activityNote ? (
        <p className="flex items-start gap-2 rounded-xl border border-mf-glass-border bg-white/[0.03] p-3 text-xs leading-5 text-mf-glass-text-secondary sm:col-span-3">
          <Info className="mt-0.5 size-3.5 shrink-0 text-mf-glass-brand" />
          {activityNote}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-mf-glass-brand px-5 py-2.5 text-sm font-semibold text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saveState === "saving" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          {saveState === "saving" ? "Saving…" : "Update nutrition plan"}
        </button>

        {dirty && saveState !== "saving" ? (
          <p role="status" className="flex items-center gap-1.5 text-xs font-semibold text-mf-glass-warning">
            <AlertTriangle className="size-3.5" />
            Unsaved changes — the numbers below still use your saved settings.
          </p>
        ) : null}

        {saveState === "success" && message && !dirty ? (
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
