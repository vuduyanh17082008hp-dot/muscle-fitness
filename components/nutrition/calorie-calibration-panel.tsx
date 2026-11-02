"use client"

import { useId, useState, useTransition, type FormEvent } from "react"

import { useRouter } from "next/navigation"

import { CheckCircle2, Loader2, Scale, XCircle } from "lucide-react"

import {
  logBodyWeightAction,
  reviewCalorieCalibrationAction,
  type NutritionSettingsActionResult,
} from "@/app/dashboard/nutrition/actions"
import type { CalibrationResult } from "@/lib/nutrition/calibration"

type Props = {
  available: boolean
  readFailed: boolean
  today: string
  todayWeightKg: number | null
  result: CalibrationResult | null
  currentTargetCalories: number
  estimatedTargetCalories: number
  adjustmentKcal: number
}

type Feedback = { ok: boolean; text: string } | null

const BUTTON_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-mf-glass-brand px-4 py-2.5 text-sm font-semibold text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
const BUTTON_SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-mf-glass-border bg-white/5 px-4 py-2.5 text-sm font-semibold text-mf-glass-text transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"

function signed(n: number) {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`
}

export function CalorieCalibrationPanel({
  available,
  readFailed,
  today,
  todayWeightKg,
  result,
  currentTargetCalories,
  estimatedTargetCalories,
  adjustmentKcal,
}: Props) {
  const router = useRouter()
  const weightId = useId()
  const [weight, setWeight] = useState(todayWeightKg === null ? "" : String(todayWeightKg))
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function run(key: string, action: (fd: FormData) => Promise<NutritionSettingsActionResult>, formData: FormData) {
    setBusy(key)
    setFeedback(null)
    startTransition(async () => {
      const outcome = await action(formData)
      // Only the server's answer is shown — never an optimistic "updated".
      setFeedback({ ok: outcome.success, text: outcome.message })
      setBusy(null)
      if (outcome.success) router.refresh()
    })
  }

  function submit(key: string, action: (fd: FormData) => Promise<NutritionSettingsActionResult>) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      run(key, action, new FormData(event.currentTarget))
    }
  }

  const trend = result && "trend" in result ? result.trend : null

  return (
    <div className="space-y-5">
      {/* Log today's weight */}
      <form onSubmit={submit("weight", logBodyWeightAction)} className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor={weightId}
            className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-mf-glass-text-muted"
          >
            Today&apos;s weight ({today})
          </label>
          <div className="flex items-center gap-2">
            <input
              id={weightId}
              name="weightKg"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={20}
              max={500}
              required
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-32 rounded-xl border border-mf-glass-border bg-mf-glass-bg-deep px-3.5 py-2.5 text-base font-medium text-mf-glass-text outline-none transition focus:border-mf-glass-brand-border"
            />
            <span className="text-sm text-mf-glass-text-muted">kg</span>
          </div>
        </div>
        <button type="submit" disabled={busy !== null} className={BUTTON_SECONDARY}>
          {busy === "weight" ? <Loader2 className="size-4 animate-spin" /> : <Scale className="size-4" />}
          {todayWeightKg === null ? "Log weight" : "Update today's weight"}
        </button>
        <p className="w-full text-xs leading-5 text-mf-glass-text-muted">
          Logging a weight never changes your target on its own.
        </p>
      </form>

      {/* Trend */}
      {readFailed ? (
        <p role="alert" className="text-sm text-mf-glass-warning">
          Your weight or food history couldn&apos;t be loaded, so no review is shown. Nothing was changed.
        </p>
      ) : result ? (
        <div className="rounded-[16px] border border-mf-glass-border bg-white/[0.02] p-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-mf-glass-text-muted">
            Weight trend review
          </p>

          {trend ? (
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-mf-glass-text-muted">
                  Previous week ({trend.previous.from} – {trend.previous.to})
                </dt>
                <dd className="font-semibold text-mf-glass-text">
                  {trend.previous.averageKg ?? "—"} kg avg · {trend.previous.readings} weigh-ins
                </dd>
              </div>
              <div>
                <dt className="text-xs text-mf-glass-text-muted">
                  Last 7 days ({trend.recent.from} – {trend.recent.to})
                </dt>
                <dd className="font-semibold text-mf-glass-text">
                  {trend.recent.averageKg ?? "—"} kg avg · {trend.recent.readings} weigh-ins
                </dd>
              </div>
              <div>
                <dt className="text-xs text-mf-glass-text-muted">Weekly change</dt>
                <dd className="font-semibold text-mf-glass-text">
                  {signed(trend.weeklyChangeKg)} kg ({signed(trend.weeklyChangePercent)}%)
                </dd>
              </div>
            </dl>
          ) : null}

          <p className="mt-3 text-sm leading-6 text-mf-glass-text-secondary">{result.message}</p>

          {result.intake.loggedDays > 0 ? (
            <p className="mt-2 text-xs leading-5 text-mf-glass-text-muted">
              Food logged on {result.intake.loggedDays} of {result.intake.windowDays} days
              {result.intake.averageCalories !== null ? ` · average ${result.intake.averageCalories} kcal on those days` : ""}.
            </p>
          ) : null}

          {result.status === "propose" ? (
            <div className="mt-4 rounded-xl border border-mf-glass-brand-border bg-mf-glass-brand-soft p-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-mf-glass-brand">
                Suggested adjustment — your decision
              </p>
              <p className="mt-2 text-sm text-mf-glass-text">
                Current {result.currentTargetCalories} kcal → proposed{" "}
                <strong>{result.proposedTargetCalories} kcal</strong> ({signed(result.deltaKcal)} kcal/day)
              </p>
              {result.uncertainty ? (
                <p className="mt-2 text-xs leading-5 text-mf-glass-text-muted">{result.uncertainty}</p>
              ) : null}

              {available ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  <form onSubmit={submit("accept", reviewCalorieCalibrationAction)}>
                    <input type="hidden" name="decision" value="accept" />
                    <input type="hidden" name="expectedTargetCalories" value={currentTargetCalories} />
                    <input type="hidden" name="expectedDeltaKcal" value={result.deltaKcal} />
                    <button type="submit" disabled={busy !== null} className={BUTTON_PRIMARY}>
                      {busy === "accept" ? <Loader2 className="size-4 animate-spin" /> : null}
                      Accept {result.proposedTargetCalories} kcal
                    </button>
                  </form>
                  <form onSubmit={submit("keep", reviewCalorieCalibrationAction)}>
                    <input type="hidden" name="decision" value="keep" />
                    <input type="hidden" name="expectedTargetCalories" value={currentTargetCalories} />
                    <button type="submit" disabled={busy !== null} className={BUTTON_SECONDARY}>
                      {busy === "keep" ? <Loader2 className="size-4 animate-spin" /> : null}
                      Keep current
                    </button>
                  </form>
                </div>
              ) : (
                <p className="mt-3 text-xs text-mf-glass-text-muted">
                  Applying a calibration isn&apos;t available in this environment yet.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Accepted calibration */}
      {adjustmentKcal !== 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-mf-glass-border bg-white/[0.02] p-4 text-sm text-mf-glass-text-secondary">
          <p>
            Calibrated target: {estimatedTargetCalories} kcal estimate {signed(adjustmentKcal)} kcal from your
            accepted weight-trend review = <strong className="text-mf-glass-text">{currentTargetCalories} kcal</strong>.
          </p>
          {available ? (
            <form onSubmit={submit("reset", reviewCalorieCalibrationAction)}>
              <input type="hidden" name="decision" value="reset" />
              <input type="hidden" name="expectedTargetCalories" value={currentTargetCalories} />
              <button type="submit" disabled={busy !== null} className={BUTTON_SECONDARY}>
                {busy === "reset" ? <Loader2 className="size-4 animate-spin" /> : null}
                Reset to estimate
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {feedback ? (
        <p
          role={feedback.ok ? "status" : "alert"}
          className={`flex items-center gap-1.5 text-xs font-semibold ${feedback.ok ? "text-emerald-400" : "text-red-400"}`}
        >
          {feedback.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
          {feedback.text}
        </p>
      ) : null}
    </div>
  )
}
