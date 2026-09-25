import { scrubInternalJargon } from "@/lib/dante-core/adaptive-coach-v2/natural-response/jargon-policy";
import {
  computeResponseFingerprint,
  deriveSafetySurfaceClass,
  normalizeForFingerprint,
} from "@/lib/dante-core/runtime-convergence/fingerprint";
import type {
  HardSafetySurfaceInput,
  HardSafetySurfaceResult,
  SafetySurfaceClass,
} from "@/lib/dante-core/runtime-convergence/types";

const HUMOR_PATTERN = /(?:😂|🤣|😏|lol|haha|hehe|bro 😂|đùa|joke|banter)/i;
const CONTINUE_TRAINING_PATTERN = /(?:one more set|thêm một set|cứ tập tiếp|finish (?:the )?set|tiếp tục tập nặng)/i;
const CUSTOMER_SERVICE_PATTERN = /(?:how can i help you today|chào bạn, mình có thể hỗ trợ|thank you for contacting)/i;
const RAW_CONTEXT_PATTERN = /(?:context capsule|decision object|tool authority|risk accumulator|provenance gate|\[SYSTEM\])/i;
const INTERNAL_ENUM_PATTERN = /\b(?:EMERGENCY_ACTION|URGENT_EVALUATION|STOP_ACTIVITY|HARD_BLOCK|CONFOUNDED)\b/;

const SOFT_STOP_PATTERN = /(?:có lẽ|maybe|might want to|cân nhắc nghỉ một chút|consider resting a bit)/i;

function severityRank(surface: SafetySurfaceClass): number {
  switch (surface) {
    case "NONE":
      return 0;
    case "INFO":
      return 1;
    case "CAUTION":
      return 2;
    case "STOP_ACTIVITY":
      return 3;
    case "URGENT_EVALUATION":
      return 4;
    case "EMERGENCY_ACTION":
      return 5;
    default:
      return 0;
  }
}

function buildMinimalStopSurface(language: "en" | "vi", urgency: HardSafetySurfaceInput["evaluationUrgency"]): string {
  if (language === "vi") {
    return urgency === "EMERGENCY"
      ? "Dừng set ngay. Triệu chứng này cần xử lý cấp cứu / đánh giá y tế ngay."
      : "Dừng set ngay. Triệu chứng này cần được đánh giá y tế khẩn.";
  }
  return urgency === "EMERGENCY"
    ? "Stop the set now. These symptoms need emergency / immediate medical evaluation."
    : "Stop the set now. These symptoms need urgent medical evaluation.";
}

/**
 * Map a safety-layer result onto the surface directive it is allowed to demand.
 * Only HARD_BLOCK results are a hard STOP. A SAFE_REDIRECT (e.g. composed training risk: "do not attempt a
 * max today", a possible-injury boundary) keeps its own bounded coaching copy at CAUTION strength; forcing STOP
 * on it would replace that copy with a generic "stop the set / urgent medical evaluation" it never asked for.
 */
export function deriveHardSafetyDirective(input: {
  category: string | null;
  responseMode: "HARD_BLOCK" | "SAFE_REDIRECT" | null;
}): Pick<HardSafetySurfaceInput, "activityDirective" | "evaluationUrgency"> {
  if (input.responseMode === "SAFE_REDIRECT") {
    return { activityDirective: "MODIFY", evaluationUrgency: "ROUTINE" };
  }
  return {
    activityDirective: "STOP",
    evaluationUrgency: input.category === "self_harm_crisis" ? "EMERGENCY" : "URGENT",
  };
}

/**
 * Hard safety may bypass ordinary finalizer realization.
 * It may NOT bypass safety-surface validation.
 * Does NOT reinterpret Control Plane — only validates/repairs surface strength.
 */
export function applyHardSafetySurfaceContract(input: HardSafetySurfaceInput): HardSafetySurfaceResult {
  const requiredSurface = deriveSafetySurfaceClass({
    hardSafety: true,
    activityDirective: input.activityDirective,
    evaluationUrgency: input.evaluationUrgency,
  });

  let response = scrubInternalJargon(input.draft, input.language).trim();
  let surfaceClass = requiredSurface;

  const weak =
    !/(?:dừng|stop|ngừng|ngưng|khẩn|urgent|emergency|cấp cứu|medical)/i.test(response)
    || SOFT_STOP_PATTERN.test(response)
    || HUMOR_PATTERN.test(response)
    || CONTINUE_TRAINING_PATTERN.test(response)
    || CUSTOMER_SERVICE_PATTERN.test(response);

  if (input.activityDirective === "STOP" && weak) {
    response = buildMinimalStopSurface(input.language, input.evaluationUrgency);
  }

  // Strip disallowed ornaments without changing decision severity.
  response = response
    .replace(HUMOR_PATTERN, "")
    .replace(CONTINUE_TRAINING_PATTERN, "")
    .replace(CUSTOMER_SERVICE_PATTERN, "")
    .replace(RAW_CONTEXT_PATTERN, "")
    .replace(INTERNAL_ENUM_PATTERN, "")
    .replace(/DANTE_PRIVATE_CONTEXT_CANARY_[A-Z0-9]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!response) {
    response = buildMinimalStopSurface(input.language, input.evaluationUrgency);
  }

  // Project observed surface class for audit — never below decision severity.
  let observed: SafetySurfaceClass = "INFO";
  if (/(?:cấp cứu|emergency)/i.test(response)) observed = "EMERGENCY_ACTION";
  else if (/(?:khẩn|urgent|medical evaluation|đánh giá y tế)/i.test(response)) observed = "URGENT_EVALUATION";
  else if (/(?:dừng|stop|ngừng)/i.test(response)) observed = "STOP_ACTIVITY";
  else observed = "CAUTION";

  if (severityRank(observed) < severityRank(requiredSurface)) {
    response = buildMinimalStopSurface(input.language, input.evaluationUrgency);
    observed = requiredSurface;
  }

  surfaceClass = observed;
  const fingerprint = computeResponseFingerprint({
    sourceBranch: "HARD_SAFETY",
    responseIntent: "SAFETY_RESPONSE",
    rationaleCodes: ["HARD_SAFETY_SURFACE"],
    recommendationCode: "STOP_CURRENT_SET",
    causalTarget: null,
    safetySurfaceClass: surfaceClass,
    normalizedText: normalizeForFingerprint(response),
  });

  return {
    response,
    audit: {
      routeMetadata: {
        sourceBranch: "HARD_SAFETY",
        timestamp: input.routeMetadata.timestamp,
        responseFingerprint: fingerprint,
        finalizerApplied: false,
        hardSafetyBypass: true,
      },
      safetySurfaceClass: surfaceClass,
      surfaceSeverityOk: severityRank(surfaceClass) >= severityRank(requiredSurface),
      hardSafetySurfaceContractApplied: true,
      controlPlaneMutated: false,
      externalSideEffects: false,
    },
  };
}

export function assertNoMetadataLeak(text: string): boolean {
  return !/(?:responseFingerprint|finalizerApplied|hardSafetyBypass|sourceBranch"|Decision Object|Context Capsule)/i.test(text);
}
