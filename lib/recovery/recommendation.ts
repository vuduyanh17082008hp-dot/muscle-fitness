import type { RecoveryScoreResult, TrainingLoadSummary } from "@/lib/recovery/types"

/**
 * Deterministic, rule-based recommendation text. No LLM call — this is
 * the same explanation Dante will see and expand on, never invent.
 */
export function buildRecoveryRecommendation(
  result: RecoveryScoreResult,
  trainingLoad: TrainingLoadSummary,
): string {
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
