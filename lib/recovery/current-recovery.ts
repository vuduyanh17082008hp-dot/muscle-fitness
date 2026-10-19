/**
 * CURRENT RECOVERY SEMANTICS (PF-04)
 *
 * CURRENT_RECOVERY means exactly one thing in this app: the verified
 * check-in for the user's CURRENT LOCAL CALENDAR DAY. A check-in from any
 * earlier day is never "today's" recovery — it is reported as STALE, with
 * the date it was recorded, so no surface can present it as current.
 *
 * Authority, highest first:
 *
 *   today's verified check-in  >  what the user says right now
 *   >  the most recent stale check-in  >  memory  >  inference
 *
 * A user's own number never overwrites a verified check-in: both are
 * kept and the disagreement is flagged (`conflict`). With no verified
 * check-in today, the user's number is usable as USER_EXPLICIT — never as
 * VERIFIED.
 *
 * Pure and deterministic. The score itself still comes only from
 * lib/recovery/score.ts::computeRecoveryScore.
 */

export type CurrentRecoveryStatus = "CURRENT" | "STALE" | "MISSING"

export type CurrentRecovery = {
  status: CurrentRecoveryStatus
  /**
   * CURRENT: today's score (null only when today's check-in lacks the
   * inputs to score). STALE: the score recorded on `recordedDate` — NOT
   * today's. MISSING: null.
   */
  score: number | null
  /** Local calendar date (YYYY-MM-DD) of the check-in `score` comes from. */
  recordedDate: string | null
  /** The local calendar day this was evaluated against. */
  localDate: string
  provenance: "VERIFIED_CHECKIN" | "NONE"
}

export function resolveCurrentRecovery(input: {
  localDate: string
  checkins: Array<{ checkin_date: string; recovery_score: number | null }>
  /** Today's score from computeRecoveryScore (null when there is no check-in today). */
  todayScore: number | null
}): CurrentRecovery {
  const { localDate, checkins } = input

  if (checkins.some((row) => row.checkin_date === localDate)) {
    return {
      status: "CURRENT",
      score: input.todayScore,
      recordedDate: localDate,
      localDate,
      provenance: "VERIFIED_CHECKIN",
    }
  }

  const latest = checkins
    .filter((row) => row.checkin_date < localDate && row.recovery_score !== null)
    .sort((a, b) => b.checkin_date.localeCompare(a.checkin_date))[0]

  if (latest) {
    return {
      status: "STALE",
      score: latest.recovery_score,
      recordedDate: latest.checkin_date,
      localDate,
      provenance: "VERIFIED_CHECKIN",
    }
  }

  return { status: "MISSING", score: null, recordedDate: null, localDate, provenance: "NONE" }
}

export type RecoverySpeech = {
  value: number | null
  status: CurrentRecoveryStatus
  freshness: CurrentRecoveryStatus
  source: CurrentRecovery["provenance"]
  observedAt: string | null
  mayDescribeAsCurrent: boolean
  /** The only present-tense sentence the model may use for this score. */
  line: string
}

export function recoverySpeech(current: CurrentRecovery | null): RecoverySpeech {
  if (!current || current.status === "MISSING" || current.score === null) {
    return {
      value: null,
      status: "MISSING",
      freshness: "MISSING",
      source: "NONE",
      observedAt: null,
      mayDescribeAsCurrent: false,
      line: "There is no recovery check-in today.",
    }
  }
  if (current.status === "STALE") {
    return {
      value: current.score,
      status: "STALE",
      freshness: "STALE",
      source: current.provenance,
      observedAt: current.recordedDate,
      mayDescribeAsCurrent: false,
      line: `Your last recorded recovery score was ${current.score} on ${current.recordedDate}. That is not today's readiness.`,
    }
  }
  return {
    value: current.score,
    status: "CURRENT",
    freshness: "CURRENT",
    source: current.provenance,
    observedAt: current.recordedDate,
    mayDescribeAsCurrent: true,
    line: `Your current recovery score is ${current.score} from today's check-in.`,
  }
}

const CURRENT_CLAIM = /\b(?:current recovery(?: score)?|today'?s recovery(?: score)?|current readiness|recovery score of|recovery score is)\b/i
const ALREADY_DATED = /\b(?:last recorded|previous|stale|not today|yesterday|recorded)\b/i

export function recoverySpeechOf(context: unknown): RecoverySpeech | null {
  if (!context || typeof context !== "object") return null
  const state = (context as { currentState?: { recoverySpeech?: RecoverySpeech | null } }).currentState
  return state?.recoverySpeech ?? null
}

/** A score the UI may show as today's. STALE and MISSING stay null. */
export function recoveryScoreForDisplay(current: CurrentRecovery | null, todayScore: number | null): number | null {
  return current?.status === "CURRENT" ? todayScore : null
}

/** One sentence for every surface. STALE never uses current-tense wording. */
export function describeRecovery(current: CurrentRecovery | null, userReported: number | null = null): string {
  const speech = recoverySpeech(current)
  const report = reconcileRecoveryReport(current, userReported)
  if (report.conflict && report.verified !== null) {
    return `Today's verified recovery score is ${report.verified}. You said ${userReported}. Those disagree, and the saved check-in is still ${report.verified}.`
  }
  if (current?.status === "MISSING" && userReported !== null) {
    return `You said ${userReported}. There is no recovery check-in today, so that number is not a saved score.`
  }
  return speech.line
}

/** A stale score may be cited with its date. It may not be spoken as current. */
export function guardStaleRecoverySpeech(text: string, speech: RecoverySpeech | null): string {
  if (!speech || speech.mayDescribeAsCurrent) return text
  const sentences = text.split(/(?<=[.!?])\s+/)
  const next = sentences.map((sentence) => {
    if (ALREADY_DATED.test(sentence)) return sentence
    if (speech.status === "MISSING" || speech.value === null) {
      return CURRENT_CLAIM.test(sentence) ? speech.line : sentence
    }
    const citesValue = new RegExp(`\\b${speech.value}\\b`).test(sentence)
    if (citesValue && CURRENT_CLAIM.test(sentence)) return speech.line
    if (CURRENT_CLAIM.test(sentence) && /\brecovery|readiness/i.test(sentence)) return speech.line
    return sentence
  })
  return next.join(" ").replace(/\s{2,}/g, " ").trim()
}

export type RecoveryReportProvenance = "VERIFIED" | "USER_EXPLICIT" | "STALE_CHECKIN" | "NONE"

export type RecoveryReconciliation = {
  /** Today's verified score, or null when no check-in exists today. */
  verified: number | null
  /** The number the user stated this turn, untouched. */
  userReported: number | null
  /** True only when both exist and disagree. */
  conflict: boolean
  /** The score to reason from, and how much it can be trusted. */
  effective: {
    score: number | null
    provenance: RecoveryReportProvenance
    recordedDate: string | null
  }
}

export function reconcileRecoveryReport(
  current: CurrentRecovery | null,
  userReported: number | null,
): RecoveryReconciliation {
  const verified = current?.status === "CURRENT" ? current.score : null

  const effective: RecoveryReconciliation["effective"] =
    verified !== null
      ? { score: verified, provenance: "VERIFIED", recordedDate: current?.recordedDate ?? null }
      : userReported !== null
        ? { score: userReported, provenance: "USER_EXPLICIT", recordedDate: null }
        : current?.status === "STALE"
          ? { score: current.score, provenance: "STALE_CHECKIN", recordedDate: current.recordedDate }
          : { score: null, provenance: "NONE", recordedDate: null }

  return {
    verified,
    userReported,
    conflict: verified !== null && userReported !== null && verified !== userReported,
    effective,
  }
}
