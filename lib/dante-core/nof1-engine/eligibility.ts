import { normalizeSafetyText } from "@/lib/dante-core/safety-layer";
import type { RiskEvaluationResult } from "@/lib/dante-core/risk-accumulator/types";
import type { Nof1EligibilityResult, Nof1Trigger } from "@/lib/dante-core/nof1-engine/types";

const UNSAFE_EXPERIMENT_PATTERN =
  /(?:heavier\s+overhead|overhead\s+press\s+(?:heavier|harder)|tap\s+qua\s+dau\s+nang\s+hon|provoke|pain\s+test|train\s+through\s+pain|tap\s+qua\s+dau|sleep\s+depriv|thieu\s+ngu\s+co\s+y|dehydrat|cut\s+calories\s+hard|caloric\s+restrict|overdose|supplement\s+over|drug\s+experiment|intentional\s+overtrain|tap\s+qua\s+suc)/i;

const COMPETING_CAUSES_PATTERN =
  /(?:sleep|ngu).{0,80}(?:volume|volume\s+tap)|(?:volume|volume\s+tap).{0,80}(?:sleep|ngu)|(?:which\s+one|cai\s+nao|which\s+is\s+causing|khong\s+biet\s+cai\s+nao).{0,60}(?:sleep|volume|ngu|volume)|(?:doi\s+cung\s+luc|moving\s+together|change(?:s|d)?\s+together|cung\s+luc)/i;

const REPEATED_ERROR_PATTERN =
  /(?:repeatedly|nhieu\s+lan|ba\s+tuan|several\s+weeks|multiple\s+(?:weeks|sessions)|luc\s+tot\s+luc\s+te|up\s+and\s+down|inconsistent).{0,80}(?:performance|hieu\s+suat)|(?:performance|hieu\s+suat).{0,80}(?:repeatedly|nhieu\s+lan|luc\s+tot\s+luc\s+te|inconsistent)/i;

const SINGLE_SESSION_PATTERN =
  /(?:hom\s+nay|today|buoi\s+hom\s+nay|this\s+session).{0,40}(?:suck|te|bad|missed|yeu)|(?:bench|squat|deadlift).{0,20}(?:suck|te)|(?:should\s+we\s+run\s+an?\s+experiment|nen\s+chay\s+experiment|nen\s+lam\s+thi\s+nghiem)/i;

const ASKS_EXPERIMENT_PATTERN =
  /(?:experiment|thi\s+nghiem|micro-?experiment|chay\s+test|lam\s+test|7\s+ngay|seven\s+days|thu\s+\d+\s+ngay|let'?s\s+test|test\s+whether|xem\s+co\s+giup)/i;

/**
 * Unsafe experiment framing — blocked regardless of curiosity.
 */
export function isUnsafeExperimentRequest(message: string): boolean {
  return UNSAFE_EXPERIMENT_PATTERN.test(normalizeSafetyText(message))
    || UNSAFE_EXPERIMENT_PATTERN.test(message);
}

export function isSingleSessionOvertrigger(message: string): boolean {
  const text = normalizeSafetyText(message);
  if (REPEATED_ERROR_PATTERN.test(text) || COMPETING_CAUSES_PATTERN.test(text)) return false;
  return (
    SINGLE_SESSION_PATTERN.test(text) &&
    !/(?:ba\s+tuan|several\s+weeks|nhieu\s+buoi|multiple\s+sessions|repeated)/i.test(text)
  );
}

export function detectNof1Trigger(message: string): Nof1Trigger {
  const text = normalizeSafetyText(message);
  if (COMPETING_CAUSES_PATTERN.test(text) || COMPETING_CAUSES_PATTERN.test(message)) {
    return "COMPETING_CAUSES";
  }
  if (REPEATED_ERROR_PATTERN.test(text)) {
    return "REPEATED_PREDICTION_ERROR";
  }
  if (
    /(?:khong\s+biet|not\s+sure|unclear|confounded|nhieu\s+bien).{0,50}(?:cause|nguyen\s+nhan|which)/i.test(text) &&
    ASKS_EXPERIMENT_PATTERN.test(text)
  ) {
    return "PERSISTENT_UNCERTAINTY";
  }
  if (
    /(?:sleep|ngu|volume|calories).{0,40}(?:together|cung\s+luc|cung\s+doi)/i.test(text) &&
    /(?:isolate|tach|control|giu\s+on|keep.{0,20}stable)/i.test(text)
  ) {
    return "CONFOUNDED_BUT_CONTROLLABLE";
  }
  return "NONE";
}

/**
 * Deterministic eligibility — never proposes just because it can.
 */
export function evaluateNof1Eligibility(input: {
  message: string;
  safetyTriggered: boolean;
  riskEvaluation?: RiskEvaluationResult | null;
  confidenceHasLowCausal?: boolean;
}): Nof1EligibilityResult {
  const reasons: string[] = [];

  if (input.safetyTriggered) {
    return {
      eligible: false,
      trigger: "NONE",
      reasons: ["Safety pre-gate owns this turn."],
      blockedBySafety: true,
      blockedByRisk: false,
      tooEarly: false,
    };
  }

  if (isUnsafeExperimentRequest(input.message)) {
    return {
      eligible: false,
      trigger: "NONE",
      reasons: ["Unsafe experiment framing rejected."],
      blockedBySafety: true,
      blockedByRisk: false,
      tooEarly: false,
    };
  }

  const elevatedIrritation = input.riskEvaluation?.signals.some(
    (signal) => signal.type === "REPEATED_IRRITATION" && signal.level === "ELEVATED" && !signal.resolvedAt,
  );
  if (
    elevatedIrritation &&
    /(?:heavier|overhead|provoke|nang\s+hon|qua\s+dau).{0,40}(?:press|overhead|vai|shoulder)|(?:experiment|test).{0,40}(?:overhead|heavier)/i.test(
      normalizeSafetyText(input.message),
    )
  ) {
    return {
      eligible: false,
      trigger: "NONE",
      reasons: ["Elevated irritation risk blocks provocative loading experiments."],
      blockedBySafety: false,
      blockedByRisk: true,
      tooEarly: false,
    };
  }

  if (isSingleSessionOvertrigger(input.message)) {
    const asksExperiment = ASKS_EXPERIMENT_PATTERN.test(normalizeSafetyText(input.message));
    if (!asksExperiment) {
      return {
        eligible: false,
        trigger: "NONE",
        reasons: ["Isolated session noise without an experiment ask — stay quiet."],
        blockedBySafety: false,
        blockedByRisk: false,
        tooEarly: false,
      };
    }
    return {
      eligible: false,
      trigger: "NONE",
      reasons: ["One isolated session is not enough to justify an experiment."],
      blockedBySafety: false,
      blockedByRisk: false,
      tooEarly: true,
    };
  }

  const trigger = detectNof1Trigger(input.message);
  if (trigger === "NONE" && !ASKS_EXPERIMENT_PATTERN.test(normalizeSafetyText(input.message))) {
    return {
      eligible: false,
      trigger: "NONE",
      reasons: ["No unresolved controllable question detected."],
      blockedBySafety: false,
      blockedByRisk: false,
      tooEarly: false,
    };
  }

  if (trigger === "NONE" && ASKS_EXPERIMENT_PATTERN.test(normalizeSafetyText(input.message))) {
    // User asked for a test without enough signal — still too early unless competing language exists.
    reasons.push("Experiment language present but trigger evidence is weak.");
    return {
      eligible: false,
      trigger: "NONE",
      reasons,
      blockedBySafety: false,
      blockedByRisk: false,
      tooEarly: true,
    };
  }

  reasons.push(`Trigger: ${trigger}`);
  if (input.confidenceHasLowCausal) {
    reasons.push("Causal confidence is low — a bounded test may improve evidence quality.");
  }

  return {
    eligible: true,
    trigger,
    reasons,
    blockedBySafety: false,
    blockedByRisk: false,
    tooEarly: false,
  };
}
