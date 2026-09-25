import { createHash } from "node:crypto";
import type {
  DanteResponseBranch,
  FinalizerResponseIntent,
  ResponseFingerprintInput,
  SafetySurfaceClass,
} from "@/lib/dante-core/runtime-convergence/types";
import type { DanteDecision } from "@/lib/dante-core/adaptive-coach-v2/types";

/** KEEP Vietnamese diacritics. Deterministic. No stemming/LLM. */
export function normalizeForFingerprint(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CANONICAL_RECOMMENDATIONS = new Set([
  "REDUCE_TRAINING_VOLUME",
  "STOP_CURRENT_SET",
  "KEEP_PLAN_UNCHANGED",
]);

const CANONICAL_CAUSAL_TARGETS = new Set([
  "SLEEP",
  "TRAINING_VOLUME",
  "CALORIE_INTAKE",
  "ALCOHOL",
  "CAFFEINE",
]);

export function canonicalizeRecommendationCode(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const upper = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (CANONICAL_RECOMMENDATIONS.has(upper)) return upper;
  if (/STOP|NGUNG|DUNG_SET|STOP_CURRENT/.test(upper)) return "STOP_CURRENT_SET";
  if (/REDUCE|GIAM|VOLUME/.test(upper)) return "REDUCE_TRAINING_VOLUME";
  if (/KEEP|UNCHANGED|GIU/.test(upper)) return "KEEP_PLAN_UNCHANGED";
  return upper;
}

export function canonicalizeCausalTarget(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const normalized = value.trim().toLowerCase();
  if (/sleep|ngu|giấc ngủ|giac ngu/.test(normalized)) return "SLEEP";
  if (/volume|khoi luong|training volume/.test(normalized)) return "TRAINING_VOLUME";
  if (/calor|kcal|calo/.test(normalized)) return "CALORIE_INTAKE";
  if (/alcohol|nhau|ruou/.test(normalized)) return "ALCOHOL";
  if (/caffeine|cafe/.test(normalized)) return "CAFFEINE";
  const upper = value.trim().toUpperCase().replace(/\s+/g, "_");
  return CANONICAL_CAUSAL_TARGETS.has(upper) ? upper : upper;
}

export function mapBranchToFinalizerIntent(
  branch: DanteResponseBranch,
  decision: DanteDecision | null,
): FinalizerResponseIntent {
  if (branch === "HARD_SAFETY") return "SAFETY_RESPONSE";
  if (branch === "CORRECTION") return "CORRECTION_RESPONSE";
  if (branch === "NOF1") return "EXPERIMENT_RESPONSE";
  if (branch === "TOOL") return "TOOL_ACTION_RESPONSE";
  if (branch === "FALLBACK" || branch === "PROVIDER_FAILURE") return "FALLBACK_RESPONSE";
  if (branch === "SOCIAL") {
    return decision?.responseIntent === "BOUNDARY" ? "ANTI_MANIPULATION_RESPONSE" : "SOCIAL_RESPONSE";
  }
  if (branch === "CURRENT_STATE") return "CURRENT_STATE_UPDATE";
  if (branch === "CONFIDENCE" || branch === "RISK") return "CAUSALITY_RESPONSE";
  if (decision?.responseIntent === "SAFETY") return "SAFETY_RESPONSE";
  if (decision?.responseIntent === "CORRECTION") return "CORRECTION_RESPONSE";
  if (decision?.responseIntent === "EXPERIMENT_UPDATE") return "EXPERIMENT_RESPONSE";
  if (decision?.responseIntent === "ACTION_PROPOSAL" || decision?.responseIntent === "ACTION_CONFIRMATION") {
    return "TOOL_ACTION_RESPONSE";
  }
  if (decision?.responseIntent === "BOUNDARY") return "ANTI_MANIPULATION_RESPONSE";
  return "COACHING_RESPONSE";
}

export function deriveSafetySurfaceClass(input: {
  hardSafety?: boolean;
  decision?: DanteDecision | null;
  activityDirective?: "CONTINUE" | "MODIFY" | "STOP";
  evaluationUrgency?: "NONE" | "ROUTINE" | "URGENT" | "EMERGENCY";
}): SafetySurfaceClass {
  if (input.activityDirective === "STOP" && input.evaluationUrgency === "EMERGENCY") return "EMERGENCY_ACTION";
  if (input.activityDirective === "STOP" && (input.evaluationUrgency === "URGENT" || input.hardSafety)) {
    return "URGENT_EVALUATION";
  }
  if (input.activityDirective === "STOP") return "STOP_ACTIVITY";
  if (input.activityDirective === "MODIFY") return "CAUTION";
  if (input.decision?.safety.action === "ESCALATE") return "URGENT_EVALUATION";
  if (input.decision?.safety.action === "REDIRECT") return "CAUTION";
  if (input.hardSafety) return "URGENT_EVALUATION";
  return "NONE";
}

/**
 * Deterministic fingerprint. Fixed key order. No timestamp/user IDs.
 * Uses SHA-256 (node:crypto) — already used elsewhere in the repo.
 */
export function computeResponseFingerprint(input: ResponseFingerprintInput): string {
  const rationaleCodes = [...input.rationaleCodes].map((item) => item.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const payload = {
    sourceBranch: input.sourceBranch,
    responseIntent: input.responseIntent,
    rationaleCodes,
    recommendationCode: canonicalizeRecommendationCode(input.recommendationCode),
    causalTarget: canonicalizeCausalTarget(input.causalTarget),
    safetySurfaceClass: input.safetySurfaceClass,
    normalizedText: normalizeForFingerprint(input.normalizedText),
  };
  // Fixed key order serialization
  const canonical = JSON.stringify([
    payload.sourceBranch,
    payload.responseIntent,
    payload.rationaleCodes,
    payload.recommendationCode,
    payload.causalTarget,
    payload.safetySurfaceClass,
    payload.normalizedText,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}
