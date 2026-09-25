import { projectAuthoritativeSide } from "@/lib/dante-core/runtime-convergence/laterality-surface";
import { scrubInternalJargon } from "@/lib/dante-core/adaptive-coach-v2/natural-response/jargon-policy";
import type {
  ClaimViolationCode,
  ClaimViolationKind,
  DanteDecision,
  OutputClaimConstraints,
} from "@/lib/dante-core/adaptive-coach-v2/types";

export type ClaimViolation = {
  kind: ClaimViolationKind;
  code: ClaimViolationCode;
  message: string;
};

export type ClaimValidationResult = {
  ok: boolean;
  violations: ClaimViolation[];
  repairedText: string;
  usedDeterministicRepair: boolean;
  requiresLlmRetry: false;
};

function constraintsFromDecision(decision: DanteDecision): OutputClaimConstraints {
  if (decision.claimConstraints) return decision.claimConstraints;
  const chest = decision.currentState.facts.find((item) => item.concept === "CHEST_PAIN");
  const shoulder = decision.currentState.facts.find((item) => item.concept === "SHOULDER_IRRITATION");
  return {
    episodeCount: "UNKNOWN",
    laterality: "UNCERTAIN",
    persisted: decision.tool?.persisted ?? false,
    sleepCausality: "NOT_ESTABLISHED",
    currentChestPain: chest?.state === "PRESENT" ? "PRESENT" : chest?.state === "ABSENT" || chest?.state === "RESOLVED" ? "ABSENT" : undefined,
    currentShoulder: shoulder?.state === "PRESENT" ? "PRESENT" : shoulder?.state === "ABSENT" ? "ABSENT" : undefined,
    experimentConclusion: (decision.experiment?.internalStatus as OutputClaimConstraints["experimentConclusion"]) ?? "NONE",
    rejectedClaims: decision.discourse.alreadyExplained.filter((item) => /reject|not_established|not established/i.test(item)),
  };
}

function softenCountClaims(text: string, language: "en" | "vi"): string {
  return text
    .replace(/(?:đã\s+bị|da\s+bi|had|have had|suffered)\s+(\d+)\s+(?:lần|lan|times|episodes)/gi, () =>
      language === "vi"
        ? "có thể từng xảy ra trước đó, nhưng chưa đủ sạch để đếm thành các lần xác nhận"
        : "may have happened before, but there is not enough clean evidence to count confirmed episodes")
    .replace(/(\d+)\s+(?:verified|confirmed)\s+(?:episodes?|lần|lan)/gi, language === "vi"
      ? "các lần chưa được xác nhận rõ"
      : "unverified episodes")
    .replace(/(?:Ông|ông|Ban|bạn|You)\s+đã\s+bị\s+\d+\s+lần\.?/gi, language === "vi"
      ? "Có thể từng xảy ra trước đó, nhưng chưa đủ sạch để đếm thành các lần xác nhận."
      : "It may have happened before, but there is not enough clean evidence to count confirmed episodes.");
}

function softenLaterality(text: string, language: "en" | "vi", keep?: "LEFT" | "RIGHT" | null): string {
  // An authoritative side exists: restate it / omit laterality instead of claiming the side is unknown.
  if (keep === "LEFT" || keep === "RIGHT") {
    return projectAuthoritativeSide(text, keep === "LEFT" ? "RIGHT" : "LEFT", keep, language);
  }
  // No authoritative side: uncertainty is the truthful surface.
  return text
    .replace(/vai phải/gi, language === "vi" ? "vai (chưa chắc bên nào)" : "shoulder (side uncertain)")
    .replace(/\bright shoulder\b/gi, "shoulder (side uncertain)")
    .replace(/vai trái/gi, language === "vi" ? "vai (chưa chắc bên nào)" : "shoulder (side uncertain)")
    .replace(/\bleft shoulder\b/gi, "shoulder (side uncertain)");
}

function stripFalsePersistence(text: string, language: "en" | "vi"): string {
  const cleaned = text
    .replace(/(?:^|[.!?]\s+|\n)(?:tôi|mình|i)\s+(?:đã|have)\s+(?:lưu|saved?|persisted|ghi)\b[^.!?\n]*/giu, "")
    .replace(/(?:Tôi|Mình|I)\s+đã\s+lưu[^.!?\n]*/gi, language === "vi" ? "Mình chưa lưu thay đổi này" : "I have not saved that change")
    .replace(/(?:đã lưu|has been saved|successfully saved|saved the change)/gi, language === "vi" ? "chưa lưu thay đổi này" : "has not saved that change");
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

function stripCausalOverclaim(text: string, language: "en" | "vi"): string {
  return text
    .replace(/(?:chính là nguyên nhân|is the (?:main )?cause|caused the (?:performance|improvement)|because of sleep alone)/gi,
      language === "vi" ? "chưa đủ để kết luận là nguyên nhân" : "is not established as the cause")
    .replace(/sleep\s+tốt hơn\s+chính là nguyên nhân/gi, "sleep tốt hơn chưa đủ để nhận hết công");
}

function stripCurrentStateContradiction(text: string, language: "en" | "vi"): string {
  return text
    .replace(/(?:Vì ông đang đau ngực|vì ông đang đau ngực|because you (?:are|have) chest pain|since you have chest pain)/gi,
      language === "vi" ? "Với trạng thái hiện tại ông không báo đau ngực" : "Given you are not reporting chest pain now")
    .replace(/đang đau ngực/gi, language === "vi" ? "không báo đau ngực hiện tại" : "not reporting chest pain now");
}

/**
 * Final claim validator for high-risk user-specific claims.
 * HARD invariants → deterministic repair. STYLE → soft flag, no LLM retry.
 */
export function validateOutputClaims(input: {
  draft: string;
  decision: DanteDecision;
}): ClaimValidationResult {
  const language = input.decision.userLanguage;
  const constraints = constraintsFromDecision(input.decision);
  const violations: ClaimViolation[] = [];
  let repaired = scrubInternalJargon(input.draft, language);

  const countClaim = /(?:\d+)\s*(?:lần|lan|times|episodes)|(?:đã bị|da bi|had)\s+\d+/i.test(repaired);
  if (countClaim && (constraints.episodeCount === "UNKNOWN" || constraints.episodeCount === "UNVERIFIED")) {
    violations.push({ kind: "HARD_INVARIANT", code: "FABRICATED_COUNT", message: "Exact count claimed while episodeCount is unknown." });
    repaired = softenCountClaims(repaired, language);
  }

  const lateralityClaim = /(?:vai phải|vai trái|right shoulder|left shoulder)/i.test(repaired);
  const loggedLeft =
    /(?:vai trái|left shoulder).{0,48}(?:ghi\s*log|có\s*log|logged)|(?:ghi\s*log|có\s*log|logged).{0,48}(?:vai trái|left shoulder)/i.test(repaired)
    || /(?:tháng\s*6|june).{0,40}vai trái/i.test(repaired);
  const loggedRight =
    /(?:vai phải|right shoulder).{0,48}(?:ghi\s*log|có\s*log|logged)|(?:ghi\s*log|có\s*log|logged).{0,48}(?:vai phải|right shoulder)/i.test(repaired);
  // BOTH: the user stated each side's own state; the finalizer cannot tell which sentence is about which side, so it
  // leaves laterality alone (per-side polarity is judged against authoritative state by the Phase 2 authority guard).
  if (constraints.laterality === "BOTH") {
    // nothing to scrub
  } else if (lateralityClaim && (constraints.laterality === "LEFT" || loggedLeft) && constraints.laterality !== "RIGHT") {
    const before = repaired;
    repaired = softenLaterality(repaired, language, "LEFT");
    if (repaired !== before) {
      violations.push({ kind: "HARD_INVARIANT", code: "FABRICATED_LATERALITY", message: "Unauthorized laterality side scrubbed." });
    }
  } else if (lateralityClaim && (constraints.laterality === "RIGHT" || loggedRight) && constraints.laterality !== "LEFT") {
    const before = repaired;
    repaired = softenLaterality(repaired, language, "RIGHT");
    if (repaired !== before) {
      violations.push({ kind: "HARD_INVARIANT", code: "FABRICATED_LATERALITY", message: "Unauthorized laterality side scrubbed." });
    }
  } else if (lateralityClaim && (constraints.laterality === "UNCERTAIN" || constraints.laterality === "UNSPECIFIED")) {
    violations.push({ kind: "HARD_INVARIANT", code: "FABRICATED_LATERALITY", message: "Laterality asserted while uncertain." });
    repaired = softenLaterality(repaired, language, null);
  }

  const persistenceClaim = /(?:đã lưu|da luu|has been saved|i(?:'ve| have) saved|successfully saved|persisted the|Tôi đã lưu|toi da luu)/i.test(repaired);
  if (persistenceClaim && constraints.persisted === false) {
    violations.push({ kind: "HARD_INVARIANT", code: "FALSE_PERSISTENCE", message: "Persistence claimed while tool.persisted=false." });
    repaired = stripFalsePersistence(repaired, language);
  }

  const causalClaim = /(?:chính là nguyên nhân|is the (?:main )?cause|caused the improvement|sleep .{0,40}(?:cause|nguyen nhan))/i.test(repaired);
  if (causalClaim && constraints.sleepCausality === "NOT_ESTABLISHED") {
    violations.push({ kind: "HARD_INVARIANT", code: "CAUSAL_OVERCLAIM", message: "Causal attribution not established." });
    repaired = stripCausalOverclaim(repaired, language);
  }

  const chestPresentClaim = /(?:đang đau ngực|dang dau nguc|have chest pain|you(?:'re| are) having chest pain)/i.test(repaired);
  if (chestPresentClaim && constraints.currentChestPain === "ABSENT") {
    violations.push({ kind: "HARD_INVARIANT", code: "CURRENT_STATE_CONTRADICTION", message: "Draft asserts current chest pain while state is ABSENT." });
    repaired = stripCurrentStateContradiction(repaired, language);
  }

  const supportsForce = /\b(?:SUPPORTS|mark supports|kết luận supports)\b/i.test(repaired);
  if (supportsForce && constraints.experimentConclusion && constraints.experimentConclusion !== "SUPPORTS") {
    violations.push({ kind: "HARD_INVARIANT", code: "EXPERIMENT_OVERCLAIM", message: "Forced SUPPORTS against experiment state." });
    repaired = repaired.replace(/\bSUPPORTS\b/g, language === "vi" ? "chưa đủ để kết luận" : "not established");
  }

  if (/\b(?:CONFOUNDED|Tool Authority|Risk Accumulator)\b/.test(repaired)) {
    violations.push({ kind: "STYLE", code: "MILD_JARGON", message: "Internal jargon present." });
    repaired = scrubInternalJargon(repaired, language);
  }

  const hard = violations.some((item) => item.kind === "HARD_INVARIANT");
  return {
    ok: !hard,
    violations,
    repairedText: repaired.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    usedDeterministicRepair: violations.length > 0,
    requiresLlmRetry: false,
  };
}
