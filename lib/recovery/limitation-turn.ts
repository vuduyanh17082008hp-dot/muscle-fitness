import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { classifyTodaySession } from "@/lib/dante-core/daily-decision-engine"
import { currentTrainingHold } from "@/lib/dante-core/server/training-hold-guard"
import { createPendingAction } from "@/lib/dante-core/tools/pending-actions"
import { loadCalibrationReview } from "@/lib/nutrition/calibration-data"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { renderTrainingChangeEnergy, trainingChangeEnergy, type TrainingChangeKind } from "@/lib/nutrition/training-change-energy"
import {
  detectLimitationChoice,
  renderLimitationReply,
  reviewLimitation,
  type LimitationOption,
  type ReviewInput,
  type WorkoutRef,
} from "@/lib/recovery/limitation-review"
import { loadRecoveryContext } from "@/lib/recovery/load-recovery-context"
import { buildLimitationProposal } from "@/lib/recovery/proposal"
import { deriveRecoveryState } from "@/lib/recovery/recovery-state"
import { hasAppliedAdjustment, persistWorkoutProposal } from "@/lib/recovery/supabase-apply"
import { createRecoveryAdminClient, createSupabaseAdminClient } from "@/lib/supabase/admin"
import { parseExperience, type EquipmentConstraint } from "@/lib/training/exercise-substitution"
import { loadTodaySessionRead, type TodaySession } from "@/lib/training/load-today-session"
import { loadPlannedDayRead } from "@/lib/training/planned-day"

/** Tools only this flow writes pending rows for. A new proposal supersedes any older one still pending. */
const LIMITATION_TOOLS = ["apply_workout_adjustment", "replace_session_exercise"]

export type LimitationTurnResult = {
  draft: string
  pendingConfirmation: { actionId: string; toolName: string; summary: string } | null
  trace: string
}

/** "readiness is 94", "điểm hồi phục 94" — the number the user quoted, only to say so when the saved score differs. */
const STATED = /(?:readiness|recovery|hoi phuc)(?: score| la| cua minh la| hom nay la)?\D{0,12}?(\d{2,3})\b/

const joinNames = (names: string[], and: string) => (names.length <= 1 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`)

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase()

async function slugsById(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from("exercise_library").select("id, slug").in("id", ids)
  if (error) throw new Error(error.message)
  return new Map(((data ?? []) as Array<{ id: string; slug: string | null }>).map((row) => [row.id, row.slug]))
}

async function plannedDayExercises(supabase: SupabaseClient, dayId: string): Promise<ReviewInput["exercises"]> {
  const { data, error } = await supabase
    .from("workout_exercises")
    .select("exercise_id, exercise_name, exercise_order")
    .eq("workout_day_id", dayId)
    .order("exercise_order", { ascending: true })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{ exercise_id: string | null; exercise_name: string | null }>
  const slugs = await slugsById(supabase, rows.map((row) => row.exercise_id).filter((id): id is string => Boolean(id)))
  return rows.map((row) => ({ sessionExerciseId: null, name: row.exercise_name ?? "Exercise", slug: row.exercise_id ? slugs.get(row.exercise_id) ?? null : null, isSkipped: false }))
}

export async function runLimitationTurn(input: {
  supabase: SupabaseClient
  userId: string
  now: Date
  timezone: string
  language: "en" | "vi"
  message: string
  /** Every user message of this chat, oldest first, the current one last. */
  userMessages: string[]
  limitations: Array<{ site: string; quote: string }>
}): Promise<LimitationTurnResult> {
  const { supabase, userId, now, timezone, language } = input
  const vi = language === "vi"

  const [sessionRead, planRead, recovery, hold, profileRead, nutrition] = await Promise.all([
    loadTodaySessionRead(supabase, userId, now, timezone),
    loadPlannedDayRead(supabase, userId, now, timezone),
    loadRecoveryContext(supabase, userId).catch(() => null),
    currentTrainingHold(supabase, userId, now),
    supabase.from("fitness_profiles").select("experience, training_location").eq("user_id", userId).maybeSingle(),
    loadNutritionContext(supabase, userId).catch(() => null),
  ])

  // ---- today's actual workout: a session row wins; else the plan's day; never a fabricated one.
  const session: TodaySession | null = sessionRead.status === "OK" ? sessionRead.session : null
  const status = classifyTodaySession(session, {
    sessionUnavailable: sessionRead.status !== "OK",
    plannedDay: planRead.plannedDay,
    planUnavailable: planRead.planUnavailable,
  })
  let workout: WorkoutRef
  let exercises: ReviewInput["exercises"] = []
  try {
    if (status === "unknown") workout = { kind: "UNKNOWN" }
    else if (session && status === "completed") workout = { kind: "DONE", name: session.name ?? "workout" }
    else if (session && status === "postponed") workout = { kind: "POSTPONED", name: session.name ?? "workout" }
    else if (session) {
      workout = { kind: "SESSION", sessionId: session.id, name: session.name ?? "workout", started: status === "active" }
      const slugs = await slugsById(supabase, session.exercises.map((row) => row.exerciseId).filter(Boolean))
      exercises = session.exercises.map((row) => ({ sessionExerciseId: row.sessionExerciseId, name: row.exerciseName, slug: slugs.get(row.exerciseId) ?? null, isSkipped: row.isSkipped }))
    } else if (planRead.plannedDay && planRead.plannedDay.kind !== "REST") {
      workout = { kind: "PLANNED_DAY", name: planRead.plannedDay.name }
      exercises = await plannedDayExercises(supabase, planRead.plannedDay.dayId)
    } else workout = { kind: "NONE" }
  } catch {
    workout = { kind: "UNKNOWN" }
    exercises = []
  }

  // One recovery adjustment per session (supabase-apply hasAppliedAdjustment): read it first, so no refused write is offered.
  // null = the read failed → nothing is proposed this turn (never a guess).
  const applied = workout.kind === "SESSION" ? await hasAppliedAdjustment(supabase, userId, workout.sessionId) : false
  const profile = (profileRead.data ?? null) as { experience?: string | null; training_location?: string | null } | null
  const constraints: EquipmentConstraint[] = profile?.training_location === "home" ? ["home_gym"] : []
  const review = reviewLimitation({
    limitations: input.limitations,
    workout,
    exercises,
    experience: parseExperience(profile?.experience),
    constraints,
    hold,
    alreadyAdjusted: applied === true,
    userMessages: input.userMessages,
  })
  const choice = detectLimitationChoice(input.message, review)

  // ---- what this turn proposes. Only a not-started session can be changed; KEEP writes nothing. A swap is a different
  // contract (session-mutations replace), so it stays available after a recovery adjustment — never under a hold.
  const want: LimitationOption | "REPLACE" | null =
    choice?.kind === "REPLACE" ? (hold || workout.kind !== "SESSION" || workout.started ? null : "REPLACE")
      : choice?.kind === "KEEP" || choice?.kind === "REPLACE_UNMATCHED" ? null
        : choice && review.options.includes(choice.kind) ? choice.kind
          : choice ? null
            : review.recommended
  let proposed: { kind: LimitationOption | "REPLACE"; summary: string } | null = null
  let pendingConfirmation: LimitationTurnResult["pendingConfirmation"] = null
  let proposalUnavailable = applied === null

  if (want && want !== "KEEP" && workout.kind === "SESSION" && session && applied !== null) {
    try {
      {
        let toolName: string
        let args: unknown
        let summary: string
        if (want === "REPLACE" && choice?.kind === "REPLACE") {
          const from = session.exercises.find((row) => row.sessionExerciseId === choice.fromSessionExerciseId)
          const { data: target, error } = await supabase.from("exercise_library").select("id").eq("slug", choice.toSlug).limit(1).maybeSingle()
          if (error || !target || !from) throw new Error("replacement lookup failed")
          toolName = "replace_session_exercise"
          args = { sessionId: session.id, sessionExerciseId: from.sessionExerciseId, fromExerciseId: from.exerciseId, replacementExerciseId: target.id, fromName: choice.fromName, toName: choice.toName }
          summary = vi ? `Đổi ${choice.fromName} sang ${choice.toName} trong buổi ${workout.name} hôm nay` : `Swap ${choice.fromName} for ${choice.toName} in today's ${workout.name}`
        } else {
          const mode = want === "REST" ? "REST" : "SKIP_AFFECTED"
          const affectedIds = review.exercises
            .filter((row) => !row.isSkipped && (row.status === "AFFECTED" || row.status === "UNKNOWN") && row.sessionExerciseId)
            .map((row) => row.sessionExerciseId as string)
          const recoveryState = deriveRecoveryState({
            subjectRef: userId,
            checkin: recovery?.today ?? null,
            scoreResult: recovery?.todayScoreResult ?? { score: null, status: null, drivers: [], missingInputs: [], baseline: null },
            derivedAt: now.toISOString(),
            bodyAreaRefs: review.mappedRegions,
            constraintRefs: ["user_reported_limitation"],
          })
          const proposal = buildLimitationProposal({
            subjectRef: userId,
            session,
            mode,
            affectedSessionExerciseIds: affectedIds,
            recoveryStateRef: recoveryState.recoveryStateId,
            safetyEvaluationRef: `limitation:${review.mappedRegions.join("+") || "unmapped"}`,
            evidenceRefs: [...recoveryState.sourceRefs, `USER_EXPLICIT:chat_limitation:${input.limitations.map((item) => item.site).join("+")}`],
            createdAt: now.toISOString(),
          })
          const stored = await persistWorkoutProposal(createRecoveryAdminClient(), proposal)
          if (!stored.ok) throw new Error("proposal store failed")
          const names = proposal.changes.filter((change) => change.action !== "KEEP").map((change) => change.exerciseName)
          toolName = "apply_workout_adjustment"
          args = { proposalId: proposal.proposalId }
          summary = mode === "REST"
            ? vi ? `Nghỉ hôm nay: hoãn cả ${names.length} bài của buổi ${workout.name}` : `Rest today: postpone all ${names.length} exercises in today's ${workout.name}`
            : vi ? `Hoãn ${joinNames(names, "và")} trong buổi ${workout.name} hôm nay (phần còn lại giữ nguyên)` : `Postpone ${joinNames(names, "and")} in today's ${workout.name} (the rest stays)`
        }
        // One live proposal at a time: an older pending card can no longer be confirmed.
        await createSupabaseAdminClient()
          .from("dante_tool_actions")
          .update({ status: "cancelled" })
          .eq("user_id", userId)
          .eq("status", "pending")
          .in("tool_name", LIMITATION_TOOLS)
        const pending = await createPendingAction(supabase, userId, toolName, args, summary, now)
        pendingConfirmation = { actionId: pending.actionId, toolName, summary: pending.summary }
        proposed = { kind: want, summary }
      }
    } catch (error) {
      console.warn("[DANTE LIMITATION] proposal unavailable:", error instanceof Error ? error.message : "unknown")
      proposalUnavailable = true
    }
  }

  // ---- nutrition: reviewed, never changed here.
  const changeKind: TrainingChangeKind = proposed?.kind === "REST" ? "REST" : proposed?.kind === "SKIP_AFFECTED" ? "REDUCED" : "UNCHANGED"
  let energyLine: string | null = null
  if (workout.kind !== "UNKNOWN") {
    const calibration = nutrition?.plan && nutrition.calibration.available
      ? await loadCalibrationReview(supabase, userId, nutrition).catch(() => null)
      : null
    const energy = trainingChangeEnergy({ plan: nutrition?.plan ?? null, calibration: calibration?.result ?? null, readFailed: nutrition === null || Boolean(calibration?.readFailed) })
    energyLine = renderTrainingChangeEnergy(energy, changeKind, language)
  }

  const statedMatch = fold(input.message).match(STATED)
  const stated = statedMatch && Number(statedMatch[1]) <= 100 ? Number(statedMatch[1]) : null
  const current = recovery?.current ?? null
  const draft = renderLimitationReply({
    review,
    readiness: {
      verified: current?.status === "CURRENT" ? recovery?.todayScoreResult.score ?? null : null,
      stated,
      status: recovery === null ? "UNAVAILABLE" : current?.status ?? "MISSING",
      painFlag: hold === "recovery",
    },
    language,
    proposed,
    choice,
    proposalUnavailable,
    energyLine,
  })

  return {
    draft,
    pendingConfirmation,
    trace: `limitation:regions=${review.mappedRegions.join("+") || "none"};workout=${workout.kind};affected=${review.exercises.filter((row) => row.status === "AFFECTED").length};review=${review.exercises.filter((row) => row.status === "REVIEW").length};alts=${review.alternatives.reduce((n, entry) => n + entry.options.length, 0)};choice=${choice?.kind ?? "none"};proposed=${proposed?.kind ?? "none"};hold=${hold ?? "none"};clarify=${review.needsClarification ? 1 : 0}`,
  }
}
