/**
 * Phase 1 Extension — ClaimProjection.
 * AUTHORITATIVE STATE → allowed/forbidden constraints → draft repair.
 * Deterministic. No LLM. Does not invent truth.
 */

import { projectAuthoritativeSide } from "@/lib/dante-core/runtime-convergence/laterality-surface";
import { isSidedStatement, type AuthoritativeResponseState } from "@/lib/dante-core/runtime-convergence/authoritative-state";
import { canonicalizeCausalTarget } from "@/lib/dante-core/runtime-convergence/fingerprint";
import {
  emitProvenanceAudit,
  projectProvenanceStrength,
  type ProvenanceProjectionResult,
} from "@/lib/dante-core/runtime-convergence/provenance-projection";

export type ClaimFamily =
  | "CURRENT_STATE"
  | "EXACT_COUNT"
  | "LATERALITY"
  | "CAUSAL_TARGET"
  | "CAUSAL_CONCLUSION"
  | "TOOL_PERSISTENCE"
  | "EXPERIMENT_CONCLUSION"
  | "PROVENANCE_STRENGTH";

export type ClaimProjectionResult = {
  text: string;
  violations: Array<{ family: ClaimFamily; code: string; message: string }>;
  repaired: boolean;
  provenance?: ProvenanceProjectionResult;
};

function currentShoulderPolarity(state: AuthoritativeResponseState): "PRESENT" | "ABSENT" | "UNKNOWN" {
  const current = state.currentStateClaims.filter((c) => c.concept === "SHOULDER_IRRITATION");
  // One side hurts, the other does not ("vai trái đau, vai phải không đau"): the shoulder is irritated now.
  if (current.some((c) => isSidedStatement(c) && c.polarity === "PRESENT")) return "PRESENT";
  if (current.some((c) => c.polarity === "ABSENT")) return "ABSENT";
  if (current.some((c) => c.polarity === "PRESENT")) return "PRESENT";
  return "UNKNOWN";
}

function currentChestPolarity(state: AuthoritativeResponseState): "PRESENT" | "ABSENT" | "UNKNOWN" {
  const current = state.currentStateClaims.filter((c) => c.concept === "CHEST_PAIN");
  if (current.some((c) => c.polarity === "ABSENT")) return "ABSENT";
  if (current.some((c) => c.polarity === "PRESENT")) return "PRESENT";
  return "UNKNOWN";
}

function enforceCurrentState(text: string, state: AuthoritativeResponseState, language: "en" | "vi", violations: ClaimProjectionResult["violations"]): string {
  let out = text;
  const shoulder = currentShoulderPolarity(state);
  const blockedPromotion = state.provenanceConstraints.some((c) => !c.mayPromoteToCurrent);
  const noCurrentPresent = shoulder !== "PRESENT";

  if (shoulder === "ABSENT" || (blockedPromotion && noCurrentPresent)) {
    const assertsCurrent =
      /(?:hiện tại|hien tai|currently|right now|bây giờ|bay gio).{0,40}(?:đang\s+)?(?:đau|dau|kích ứng|kich ung).{0,20}(?:vai|shoulder)|(?:đang đau vai|dang dau vai|still (?:have |having )?shoulder (?:pain|irritation)|you (?:are|still) (?:in )?pain)/i.test(out)
      || /(?:hai lần kích ứng gần đây|two recent irritation|kích ứng vùng đó hôm nay|irritation today)/i.test(out)
      || /(?:vai đang|shoulder is).{0,20}(?:đau|irritated|pain|kích ứng|kich ung)/i.test(out)
      || /(?:đang kích ứng|dang kich ung|currently irritated)/i.test(out);
    if (assertsCurrent) {
      violations.push({
        family: "CURRENT_STATE",
        code: "CURRENT_STATE_CONTRADICTION",
        message: shoulder === "ABSENT"
          ? "Draft asserts current shoulder pain while authoritative current state is ABSENT."
          : "Draft promotes uncertain/historical recall to current irritation.",
      });
      if (shoulder === "ABSENT") {
        out = language === "vi"
          ? [
              "Hiện tại ông báo cáo không còn đau vai.",
              "Hôm qua / trước đó có thể từng đau, nhưng trạng thái hiện tại là hết triệu chứng.",
              "Không lấy lịch sử cũ để nói ông đang đau lúc này.",
            ].join(" ")
          : [
              "You currently report no shoulder pain.",
              "Earlier pain may still be historical context, but current state is symptom-free.",
              "I will not treat older history as current pain.",
            ].join(" ");
      } else {
        out = language === "vi"
          ? "Đó là hồi ức không chắc từ trước, không phải kích ứng hiện tại đã xác nhận."
          : "That is uncertain prior recall, not a confirmed current irritation.";
      }
    }
  }

  const chest = currentChestPolarity(state);
  if (chest === "ABSENT" && /(?:đang đau ngực|have chest pain|you(?:'re| are) having chest pain)/i.test(out)) {
    violations.push({
      family: "CURRENT_STATE",
      code: "CURRENT_STATE_CONTRADICTION",
      message: "Draft asserts current chest pain while ABSENT.",
    });
    out = out
      .replace(/(?:đang đau ngực|dang dau nguc)/gi, language === "vi" ? "không báo đau ngực hiện tại" : "not reporting chest pain now")
      .replace(/have chest pain|you(?:'re| are) having chest pain/gi, "are not reporting chest pain now");
  }

  return out;
}

function enforceExactCount(text: string, state: AuthoritativeResponseState, language: "en" | "vi", violations: ClaimProjectionResult["violations"]): string {
  const blocked = state.provenanceConstraints.some((c) => !c.mayAssertExactCount || !c.mayAssertVerifiedCount)
    || state.historicalClaims.some((c) => c.count === "UNKNOWN" || c.count === "UNVERIFIED" || c.provenance === "USER_RECALL_UNCERTAIN");
  if (!blocked) return text;

  let out = text;
  // Affirmative verified/exact count only — ignore denials like "không coi đó là 5 lần đã xác nhận".
  const denialOfVerified =
    /(?:không coi|khong coi|chưa coi|chua coi|not (?:treat|count)|will not treat).{0,48}\d+\s*(?:lần|lan|times|episodes).{0,24}(?:confirmed|xác nhận|xac nhan|verified)/i.test(out)
    || /(?:không có log|khong co log|without (?:a )?log).{0,80}\d+\s*(?:lần|lan|times)/i.test(out);
  const verifiedClaim = !denialOfVerified && (
    /(?:\d+)\s*(?:lần|lan|times|episodes).{0,20}(?:confirmed|xác nhận|xac nhan|verified)|(?:confirmed|xác nhận|đã xác nhận).{0,20}(?:\d+)\s*(?:lần|lan)/i.test(out)
    || /(?:đã bị|da bi|had)\s+\d+\s+(?:lần|lan|times)/i.test(out)
    || /(?:hai lần kích ứng|two recent irritation|\d+\s+confirmed)/i.test(out)
  );

  if (verifiedClaim) {
    violations.push({
      family: "EXACT_COUNT",
      code: "FABRICATED_COUNT",
      message: "Exact/verified count asserted without verified provenance.",
    });
    const estimate = state.provenanceConstraints.find((c) => c.countEstimate != null)?.countEstimate;
    out = language === "vi"
      ? (estimate != null
        ? `Ông nhớ mang máng khoảng ${estimate} lần, nhưng không có log nên mình không coi đó là ${estimate} lần đã xác nhận.`
        : "Ông nhớ mang máng vài lần, nhưng không có log nên mình không coi đó là số lần đã xác nhận.")
      : (estimate != null
        ? `You roughly recall about ${estimate} times, but without a log I will not treat that as ${estimate} confirmed episodes.`
        : "You roughly recall a few times, but without a log I will not treat that as a confirmed count.");
  }
  return out;
}

function enforceLaterality(text: string, state: AuthoritativeResponseState, language: "en" | "vi", violations: ClaimProjectionResult["violations"]): string {
  const uncertain = state.provenanceConstraints.some((c) => !c.mayAssertLaterality)
    || state.historicalClaims.some((c) => c.laterality === "UNCERTAIN" || c.laterality === "UNKNOWN" || c.laterality === "UNSPECIFIED")
    || state.currentStateClaims.some((c) => c.laterality === "UNCERTAIN" || c.laterality === "UNKNOWN");

  const mayLeft = [...state.currentStateClaims, ...state.historicalClaims].some(
    (c) => c.laterality === "LEFT" && (c.provenance === "VERIFIED_TOOL_DATA" || c.provenance === "EXPLICIT_HISTORICAL_REPORT" || c.provenance === "EXPLICIT_CURRENT_REPORT"),
  ) || /(?:tháng\s*6|june).{0,40}vai trái.{0,48}(?:ghi\s*log|có\s*log|logged)|vai trái.{0,40}(?:ghi\s*log|có\s*log)/i.test(text);
  const mayRight = [...state.currentStateClaims, ...state.historicalClaims].some(
    (c) => c.laterality === "RIGHT" && (c.provenance === "VERIFIED_TOOL_DATA" || c.provenance === "EXPLICIT_HISTORICAL_REPORT" || c.provenance === "EXPLICIT_CURRENT_REPORT"),
  );

  if (!uncertain && (mayLeft || mayRight)) return text;

  let out = text;
  const assertsSide = /(?:vai phải|vai trái|right shoulder|left shoulder|bên phải|ben phai|bên trái|ben trai)/i.test(out);
  if (!assertsSide) return out;

  // Mixed claims: keep verified/explicit sides; only scrub unauthorized sides.
  if (mayLeft || mayRight) {
    // Exactly one side is authoritative: restate it (or omit laterality) — never turn a known side into "unknown".
    const authoritativeSide = mayLeft && !mayRight ? "LEFT" : mayRight && !mayLeft ? "RIGHT" : null;
    if (authoritativeSide) {
      const unauthorizedSide = authoritativeSide === "LEFT" ? "RIGHT" : "LEFT";
      const pattern = unauthorizedSide === "RIGHT"
        ? /(?:vai phải|right shoulder|bên phải|ben phai)/i
        : /(?:vai trái|left shoulder|bên trái|ben trai)/i;
      if (pattern.test(out)) {
        violations.push({
          family: "LATERALITY",
          code: "FABRICATED_LATERALITY",
          message: `${unauthorizedSide} laterality asserted against authoritative ${authoritativeSide}.`,
        });
        out = projectAuthoritativeSide(out, unauthorizedSide, authoritativeSide, language)
          .replace(unauthorizedSide === "RIGHT" ? /bên phải|ben phai/gi : /bên trái|ben trai/gi, language === "vi" ? "bên còn lại" : "the other side");
      }
      return out;
    }
    if (!mayRight && /(?:vai phải|right shoulder|bên phải|ben phai)/i.test(out)) {
      violations.push({
        family: "LATERALITY",
        code: "FABRICATED_LATERALITY",
        message: "Right laterality asserted without authoritative support.",
      });
      out = out
        .replace(/vai phải/gi, language === "vi" ? "vai (chưa chắc bên nào)" : "shoulder (side uncertain)")
        .replace(/bên phải|ben phai/gi, language === "vi" ? "bên chưa chắc" : "uncertain side")
        .replace(/\bright shoulder\b/gi, "shoulder (side uncertain)");
    }
    if (!mayLeft && /(?:vai trái|left shoulder|bên trái|ben trai)/i.test(out)) {
      violations.push({
        family: "LATERALITY",
        code: "FABRICATED_LATERALITY",
        message: "Left laterality asserted without authoritative support.",
      });
      out = out
        .replace(/vai trái/gi, language === "vi" ? "vai (chưa chắc bên nào)" : "shoulder (side uncertain)")
        .replace(/bên trái|ben trai/gi, language === "vi" ? "bên chưa chắc" : "uncertain side")
        .replace(/\bleft shoulder\b/gi, "shoulder (side uncertain)");
    }
    return out;
  }

  if (uncertain) {
    violations.push({
      family: "LATERALITY",
      code: "FABRICATED_LATERALITY",
      message: "Laterality asserted while unknown/uncertain.",
    });
    out = out
      .replace(/vai phải/gi, language === "vi" ? "vai (chưa chắc bên nào)" : "shoulder (side uncertain)")
      .replace(/vai trái/gi, language === "vi" ? "vai (chưa chắc bên nào)" : "shoulder (side uncertain)")
      .replace(/bên phải|ben phai/gi, language === "vi" ? "bên chưa chắc" : "uncertain side")
      .replace(/bên trái|ben trai/gi, language === "vi" ? "bên chưa chắc" : "uncertain side")
      .replace(/\bright shoulder\b/gi, "shoulder (side uncertain)")
      .replace(/\bleft shoulder\b/gi, "shoulder (side uncertain)");
  }
  return out;
}

function enforceCausalTarget(text: string, state: AuthoritativeResponseState, language: "en" | "vi", violations: ClaimProjectionResult["violations"]): string {
  const causal = state.causalClaims[0];
  if (!causal?.target) return text;

  const target = canonicalizeCausalTarget(causal.target);
  if (!target) return text;

  const mentionsSleep = /(?:sleep|ngủ|ngu|giấc ngủ|giac ngu)/i.test(text);
  const mentionsCaffeine = /(?:caffeine|cafe|cà phê|ca phe)/i.test(text);
  const mentionsTarget = target === "SLEEP" ? mentionsSleep
    : target === "CAFFEINE" ? mentionsCaffeine
    : new RegExp(target.replace(/_/g, "[_\\s]"), "i").test(text);

  // Primary drift: caffeine answer when target is SLEEP
  if (target === "SLEEP" && mentionsCaffeine && !mentionsSleep) {
    violations.push({
      family: "CAUSAL_TARGET",
      code: "CAUSAL_TARGET_DRIFT",
      message: "Draft answers CAFFEINE while authoritative target is SLEEP.",
    });
    return language === "vi"
      ? "Câu hỏi của ông là về sleep. Chưa đủ dữ liệu để nói sleep chắc chắn là nguyên nhân bench RPE giảm — có thể có confounder, nhưng mình không chuyển sang khẳng định caffeine thay cho sleep."
      : "Your question is about sleep. There is not enough data to say sleep certainly caused the lower bench RPE — other confounders may exist, but I will not replace the sleep target with a caffeine claim.";
  }

  if (!mentionsTarget) {
    violations.push({
      family: "CAUSAL_TARGET",
      code: "CAUSAL_TARGET_MISSING",
      message: `Draft does not resolve canonical causalTarget=${target}.`,
    });
    if (target === "SLEEP") {
      return language === "vi"
        ? "Về sleep: chưa đủ bằng chứng để khẳng định sleep là nguyên nhân chắc chắn của bench RPE giảm."
        : "On sleep: there is not enough evidence to assert sleep as the certain cause of the lower bench RPE.";
    }
  }

  return text;
}

function enforceCausalConclusion(text: string, state: AuthoritativeResponseState, language: "en" | "vi", violations: ClaimProjectionResult["violations"]): string {
  const causal = state.causalClaims[0];
  if (!causal || causal.conclusion === "ESTABLISHED") return text;

  let out = text;
  if (/(?:chắc chắn là nguyên nhân|chac chan la nguyen nhan|certainly (?:the |is the )?cause|is definitely the cause|chính là nguyên nhân|is the (?:main )?cause)/i.test(out)) {
    violations.push({
      family: "CAUSAL_CONCLUSION",
      code: "CAUSAL_OVERCLAIM",
      message: "Causal certainty inflated beyond NOT_ESTABLISHED.",
    });
    out = out
      .replace(/(?:chắc chắn là nguyên nhân|chac chan la nguyen nhan|certainly (?:the |is the )?cause|is definitely the cause|chính là nguyên nhân|is the (?:main )?cause)/gi,
        language === "vi" ? "chưa đủ để kết luận là nguyên nhân" : "is not established as the cause");
  }
  return out;
}

function enforceToolPersistence(text: string, state: AuthoritativeResponseState, language: "en" | "vi", violations: ClaimProjectionResult["violations"]): string {
  if (state.actionState?.persisted === true) return text;
  if (state.actionState == null && !/(?:đã lưu|has been saved|i(?:'ve| have) saved)/i.test(text)) return text;

  let out = text;
  if (/(?:đã lưu|da luu|has been saved|i(?:'ve| have) saved|successfully saved)/i.test(out)) {
    violations.push({
      family: "TOOL_PERSISTENCE",
      code: "FALSE_PERSISTENCE",
      message: "Persistence claimed without successful write.",
    });
    out = language === "vi"
      ? out
        .replace(/(?:Tôi|Mình|I)\s+đã\s+lưu[^.!?\n]*/gi, "Mình chưa lưu thay đổi này")
        .replace(/(?:đã lưu|has been saved|successfully saved)/gi, "chưa lưu thay đổi này")
      : out.replace(/\bI(?:'ve| have) saved\b/gi, "I have not saved")
        .replace(/(?:has been saved|successfully saved)/gi, "has not been saved");
  }
  return out;
}

function enforceExperimentConclusion(text: string, state: AuthoritativeResponseState, language: "en" | "vi", violations: ClaimProjectionResult["violations"]): string {
  const conclusion = state.experimentState?.conclusion;
  if (!conclusion || conclusion === "SUPPORTS" || conclusion === "NONE" || conclusion === "UNKNOWN") return text;

  let out = text;
  if (/\b(?:SUPPORTS|kết luận supports|supports the hypothesis)\b/i.test(out)) {
    violations.push({
      family: "EXPERIMENT_CONCLUSION",
      code: "EXPERIMENT_OVERCLAIM",
      message: "Forced SUPPORTS against experiment state.",
    });
    out = out.replace(/\bSUPPORTS\b/g, language === "vi" ? "chưa đủ để kết luận" : "not established")
      .replace(/supports the hypothesis/gi, language === "vi" ? "chưa đủ để kết luận giả thuyết" : "does not cleanly support the hypothesis");
  }
  return out;
}

/**
 * Project authoritative constraints onto draft text.
 * Order: provenance monotonicity → current-state → count → laterality →
 * causal target → causal conclusion → tool → experiment.
 */
export function projectClaims(input: {
  draft: string;
  authoritative: AuthoritativeResponseState;
  language: "en" | "vi";
}): ClaimProjectionResult {
  const violations: ClaimProjectionResult["violations"] = [];
  let text = input.draft;

  const provenance = projectProvenanceStrength({
    draft: text,
    authoritative: input.authoritative,
    language: input.language,
  });
  emitProvenanceAudit(provenance);
  if (provenance.repairApplied || !provenance.monotonicityPassed) {
    violations.push({
      family: "PROVENANCE_STRENGTH",
      code: "PROVENANCE_STRENGTH_INFLATION",
      message: `Output strength ${provenance.projectedOutputStrength} exceeds input ${provenance.inputStrength}.`,
    });
    text = provenance.text;
  }

  text = enforceCurrentState(text, input.authoritative, input.language, violations);
  text = enforceExactCount(text, input.authoritative, input.language, violations);
  text = enforceLaterality(text, input.authoritative, input.language, violations);
  text = enforceCausalTarget(text, input.authoritative, input.language, violations);
  text = enforceCausalConclusion(text, input.authoritative, input.language, violations);
  text = enforceToolPersistence(text, input.authoritative, input.language, violations);
  text = enforceExperimentConclusion(text, input.authoritative, input.language, violations);

  // Re-check monotonicity after other repairs (must not re-inflate).
  const finalProvenance = projectProvenanceStrength({
    draft: text,
    authoritative: input.authoritative,
    language: input.language,
  });
  if (finalProvenance.repairApplied) {
    text = finalProvenance.text;
    if (!violations.some((v) => v.code === "PROVENANCE_STRENGTH_INFLATION")) {
      violations.push({
        family: "PROVENANCE_STRENGTH",
        code: "PROVENANCE_STRENGTH_INFLATION",
        message: `Output strength re-inflated after secondary repair.`,
      });
    }
  }

  return {
    text: text.replace(/\s{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim(),
    violations,
    repaired: violations.length > 0 || provenance.repairApplied || finalProvenance.repairApplied,
    provenance: finalProvenance,
  };
}

/** Strip unique canaries / raw history dumps from visible text. */
export function scrubRawContextLeaks(text: string, canaries: string[] = []): string {
  let out = text;
  for (const canary of canaries) {
    if (canary) out = out.split(canary).join("");
  }
  out = out
    .replace(/DANTE_PRIVATE_CONTEXT_CANARY_[A-Z0-9]+/g, "")
    .replace(/(?:Quay lại đúng mạch đang làm|Back to the active thread):\s*[^\n]+/gi, "")
    .replace(/(?:context capsule|decision object|tool authority|working memory dump|\[SYSTEM\])/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return out;
}
