import { asksTrainingDecision } from "./classify";
import type { PhraseHit } from "./phrases";
import type { ReadinessSignals } from "./types";

const STATED_SCORE = /(?<![\p{L}\p{N}])recovery(?: score)?(?![\p{L}\p{N}])\D{0,14}?(\d{1,3})(?![\p{L}\p{N}]|[.,]\d)/iu;
const BASELINE_Q = /(?:thấp|cao|khác|tệ|tốt) hơn (?:bình thường|mức thường|mọi khi|trung bình|baseline|mức của (?:tôi|mình))|so với (?:bình thường|baseline|trung bình|mức thường)|(?:lower|higher|worse|better|different) than (?:usual|normal|my (?:usual|normal|average|baseline)|average|baseline)|(?:below|above) (?:my )?(?:normal|usual|average|baseline)/iu;
const LOW_WORDS = /(?<![\p{L}\p{N}])recovery (?:is |was )?(?:low|bad|poor|thấp|tệ)(?![\p{L}\p{N}])/iu;
const LOW_STATES = new Set(["SLEEPINESS", "SHORT_SLEEP", "FATIGUE", "SORENESS", "FEELS_BAD"]);

/** Recovery below 50 is the app's own "Recovery Priority" band (lib/recovery/score.ts::statusForScore). */
const LOW_BELOW = 50;

/**
 * What the user said about OBJECTIVE readiness (a recovery number) and SUBJECTIVE readiness (how they feel), this turn only.
 * Returns null when the message carries neither and asks no decision. Self-reported: verified Athlete State outranks it.
 */
export function extractReadiness(normalized: string, phrases: PhraseHit[]): ReadinessSignals | null {
  const decisionRequested = asksTrainingDecision(normalized);
  const score = STATED_SCORE.exec(normalized);
  const statedRecoveryScore = score && Number(score[1]) <= 100 ? Number(score[1]) : null;
  const baselineQuestion = BASELINE_Q.test(normalized);

  // The later-stated feeling wins when both a good and a bad one appear ("buồn ngủ nhưng vẫn khỏe").
  const feelings = phrases.filter((p) => p.kind === "STATE" && (p.key === "FEELS_GOOD" || LOW_STATES.has(p.key)));
  const last = feelings[feelings.length - 1];
  const subjective: ReadinessSignals["subjective"] = last ? (last.key === "FEELS_GOOD" ? "HIGH" : "LOW") : null;

  const objective: ReadinessSignals["objective"] = statedRecoveryScore !== null
    ? (statedRecoveryScore < LOW_BELOW ? "LOW" : "OK")
    : LOW_WORDS.test(normalized) ? "LOW" : null;

  if (!decisionRequested && statedRecoveryScore === null && subjective === null && objective === null && !baselineQuestion) return null;
  const conflict = (objective === "LOW" && subjective === "HIGH") || (objective === "OK" && subjective === "LOW");
  return { decisionRequested, statedRecoveryScore, objective, subjective, conflict, baselineQuestion };
}
