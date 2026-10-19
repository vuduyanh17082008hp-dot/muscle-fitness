/**
 * Privacy-safe, in-memory development telemetry for follow-up resolution.
 * Counts only enums and booleans: no message text, no food history, no ids,
 * no Athlete State. Nothing is persisted or sent anywhere; set
 * NUTRITION_COACH_TELEMETRY=1 (non-production) to also print each event.
 */

export type FollowUpEvent = {
  followUpDetected: boolean
  resolvedIntent?: string
  referentType?: string
  candidateCount: number
  responseMode?: string
  resolutionConfidence?: string
  usedModel?: boolean
  newTopic?: boolean
  genericFallback?: boolean
  safetyBlocked?: boolean
  clarified?: boolean
}

const counters = { turns: 0, followUps: 0, clarifications: 0, modelResolutions: 0, genericFallbacks: 0, newTopics: 0, safetyBlocks: 0 }

export function recordFollowUpEvent(event: FollowUpEvent): void {
  counters.turns += 1
  if (event.followUpDetected) counters.followUps += 1
  if (event.clarified) counters.clarifications += 1
  if (event.usedModel) counters.modelResolutions += 1
  if (event.genericFallback) counters.genericFallbacks += 1
  if (event.newTopic) counters.newTopics += 1
  if (event.safetyBlocked) counters.safetyBlocks += 1
  if (process.env.NODE_ENV !== "production" && process.env.NUTRITION_COACH_TELEMETRY === "1") console.debug("[nutrition-followup]", JSON.stringify(event))
}

const rate = (n: number, d: number) => (d === 0 ? 0 : n / d)

/** Measurable-at-runtime rates. correctReferentRate / newTopicFalsePositiveRate need ground truth and are computed by the eval tests instead. */
export function getFollowUpMetrics() {
  return {
    ...counters,
    followUpDetectionRate: rate(counters.followUps, counters.turns),
    clarificationRate: rate(counters.clarifications, counters.followUps),
    fallbackLLMRate: rate(counters.modelResolutions, counters.turns),
    genericFallbackRate: rate(counters.genericFallbacks, counters.turns),
    safetyBlockRate: rate(counters.safetyBlocks, counters.turns),
  }
}

export function resetFollowUpMetrics(): void {
  for (const key of Object.keys(counters) as Array<keyof typeof counters>) counters[key] = 0
}
