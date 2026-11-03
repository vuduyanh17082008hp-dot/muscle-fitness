import type { trainingHold } from "@/lib/dante-core/daily-decision-engine"
import type { RecoveryScoreResult, TrainingLoadSummary } from "@/lib/recovery/types"

/** Recovery's line while the Daily Brief decision holds training (trainingHold): it never clears a session the Brief holds. */
export const HELD_RECOVERY_RECOMMENDATION = {
  recovery:
    "Your check-in flagged pain or illness, so recovery comes before training today — don't push a planned session. See a medical professional if it persists or worsens.",
  unverified:
    "Today's pain/illness check-in couldn't be confirmed, so Dante isn't recommending a training session. Check in again before you train.",
} as const

/**
 * Deterministic, rule-based recommendation text. No LLM call — this is
 * the same explanation Dante will see and expand on, never invent.
 * `hold` = trainingHold(dailyDecision): when set it wins over the score, exactly as on Today.
 */
export function buildRecoveryRecommendation(
  result: RecoveryScoreResult,
  trainingLoad: TrainingLoadSummary,
  hold: ReturnType<typeof trainingHold> = null,
): string {
  if (hold) return HELD_RECOVERY_RECOMMENDATION[hold]

  if (result.score === null) {
    return "Complete today's check-in to get a personalised recommendation based on your sleep, stress, fatigue, soreness and readiness."
  }

  const weakestDriver = [...result.drivers]
    .filter((driver) => driver.available)
    .sort((a, b) => a.score - b.score)[0]

  const focusLine = weakestDriver
    ? ` ${weakestDriver.label} is currently your biggest limiter today.`
    : ""

  if (result.status === "ready") {
    return `Your recovery signals support a normal training day.${focusLine} ${trainingLoad.state === "amber" ? "Recent training load has been high, so keep an eye on volume even though you're ready." : "Proceed with your planned session."}`
  }

  if (result.status === "good") {
    return `Recovery is solid today.${focusLine} Train your plan as normal, and keep technique quality high on your most demanding lifts.`
  }

  if (result.status === "moderate") {
    return `Recovery is moderate today.${focusLine} Maintain your planned intensity where possible, but consider trimming a set or two of unnecessary volume.`
  }

  return `Recovery signals suggest today is a priority-recovery day.${focusLine} Consider a lower-stress session, extra mobility, or an additional rest day rather than pushing your hardest planned session.`
}
