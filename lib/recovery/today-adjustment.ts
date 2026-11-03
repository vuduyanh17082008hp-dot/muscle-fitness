import { buildRecoveryRecommendation } from "@/lib/recovery/recommendation"
import { deriveRecoveryState } from "@/lib/recovery/recovery-state"
import { generateWorkoutAdjustmentProposal } from "@/lib/recovery/proposal"
import { deriveWorkoutSafetyScope } from "@/lib/recovery/workout-safety-scope"
import type { RecoveryContext } from "@/lib/recovery/load-recovery-context"
import type { TodaySession } from "@/lib/training/load-today-session"
import type { trainingHold } from "@/lib/dante-core/daily-decision-engine"

export function buildTodayAdjustment(input: {
  userId: string
  recovery: RecoveryContext
  session: TodaySession | null
  /** trainingHold(dailyDecision) — the insight never clears training the Daily Brief holds. */
  hold?: ReturnType<typeof trainingHold>
}) {
  const safetyScope = deriveWorkoutSafetyScope({
    painIllness: input.recovery.today?.pain_illness ?? "no",
    notes: input.recovery.today?.notes ?? null,
  })
  const recoveryState = deriveRecoveryState({
    subjectRef: input.userId,
    checkin: input.recovery.today,
    scoreResult: input.recovery.todayScoreResult,
    bodyAreaRefs: safetyScope.affectedBodyAreaRefs,
    constraintRefs: safetyScope.constraintRefs,
  })
  const proposal = generateWorkoutAdjustmentProposal({
    subjectRef: input.userId,
    recoveryState,
    safetyScope,
    session: input.session,
  })
  const insight = buildRecoveryRecommendation(
    input.recovery.todayScoreResult,
    input.recovery.trainingLoad,
    input.hold ?? null,
  )

  return { recoveryState, safetyScope, proposal, insight }
}
