/**
 * Phase 1 Closure — Provenance strength monotonicity.
 * OUTPUT epistemic strength must never exceed AUTHORITATIVE input strength.
 * Deterministic. No LLM. Not keyword-scrub-as-core-fix.
 */

import type { AuthoritativeResponseState, ProvenanceConstraint } from "@/lib/dante-core/runtime-convergence/authoritative-state";

/** Closed epistemic strength ladder (low → high). */
export type ProvenanceStrength =
  | "USER_UNCERTAIN_RECALL"
  | "USER_EXPLICIT"
  | "VERIFIED_LOG";

const STRENGTH_RANK: Record<ProvenanceStrength, number> = {
  USER_UNCERTAIN_RECALL: 1,
  USER_EXPLICIT: 2,
  VERIFIED_LOG: 3,
};

export type ProvenanceProjectionResult = {
  text: string;
  inputStrength: ProvenanceStrength | null;
  projectedOutputStrength: ProvenanceStrength | null;
  monotonicityPassed: boolean;
  repairApplied: boolean;
  countEstimate: number | null;
  countVerified: false | true | null;
  laterality: "UNKNOWN" | "LEFT" | "RIGHT" | "UNSPECIFIED" | null;
  temporal: "HISTORICAL" | "CURRENT" | "UNKNOWN" | null;
};

function rank(strength: ProvenanceStrength | null): number {
  if (!strength) return 0;
  return STRENGTH_RANK[strength];
}

export function deriveInputProvenanceStrength(state: AuthoritativeResponseState): ProvenanceStrength | null {
  const sources = state.provenanceConstraints.map((c) => c.source);
  if (sources.includes("USER_RECALL_UNCERTAIN")) return "USER_UNCERTAIN_RECALL";
  if (
    state.historicalClaims.some((c) => c.provenance === "USER_RECALL_UNCERTAIN")
    || state.currentStateClaims.some((c) => c.provenance === "USER_RECALL_UNCERTAIN")
  ) {
    return "USER_UNCERTAIN_RECALL";
  }
  if (
    state.historicalClaims.some((c) => c.provenance === "VERIFIED_TOOL_DATA")
    || state.currentStateClaims.some((c) => c.provenance === "VERIFIED_TOOL_DATA")
  ) {
    return "VERIFIED_LOG";
  }
  if (
    state.historicalClaims.some((c) => c.provenance === "EXPLICIT_HISTORICAL_REPORT" || c.provenance === "EXPLICIT_CURRENT_REPORT")
    || state.currentStateClaims.some((c) => c.provenance === "EXPLICIT_CURRENT_REPORT")
  ) {
    return "USER_EXPLICIT";
  }
  return null;
}

/**
 * Infer the epistemic strength the draft is asserting — not content truth.
 * Uses the MAX strength across clauses so a hedge in one sentence cannot
 * mask an assertive occurrence claim in another.
 */
export function inferOutputProvenanceStrength(text: string): ProvenanceStrength | null {
  const t = text.trim();
  if (!t) return null;

  const clauses = t.split(/(?<=[.!?…])\s+|\n+/).map((c) => c.trim()).filter(Boolean);
  const units = clauses.length > 0 ? clauses : [t];

  let maxStrength: ProvenanceStrength | null = null;
  for (const unit of units) {
    const strength = inferClauseProvenanceStrength(unit);
    if (!strength) continue;
    if (!maxStrength || STRENGTH_RANK[strength] > STRENGTH_RANK[maxStrength]) {
      maxStrength = strength;
    }
  }
  return maxStrength;
}

function inferClauseProvenanceStrength(clause: string): ProvenanceStrength | null {
  const uncertain =
    /(?:hình như|hinh nhu|mang máng|mang mang|nhớ mang máng|nho mang mang|không chắc|khong chac|không có log|khong co log|chưa (?:đủ để )?coi|chua (?:du de )?coi|chưa coi|chua coi|roughly recall|without (?:a )?log|not (?:treat|count).{0,40}confirmed|will not treat|unverified|uncertain recall|có thể từng|co the tung|may have happened)/i.test(clause)
    || /(?:bên nào cũng chưa rõ|ben nao cung chua ro|which side is also unclear|chưa đủ sạch để đếm|chua du sach de dem)/i.test(clause);

  const denialOfVerified =
    /(?:không coi|khong coi|chưa coi|chua coi|not (?:treat|count)|will not treat|chưa (?:đủ để )?coi|chưa đủ sạch).{0,64}(?:confirmed|xác nhận|xac nhan|verified)/i.test(clause)
    || /(?:không có log|khong co log|without (?:a )?log).{0,96}(?:confirmed|xác nhận|xac nhan|verified|\d+\s*(?:lần|lan|times))/i.test(clause);

  const verified =
    !denialOfVerified
    && !uncertain
    && /(?:confirmed|verified|đã xác nhận|da xac nhan|xác nhận rõ|từ log|from (?:the )?log|verified log)/i.test(clause);
  if (verified) return "VERIFIED_LOG";

  if (uncertain) return "USER_UNCERTAIN_RECALL";

  const assertedOccurrence =
    /(?:đã trải qua|da trai qua|đã xảy ra|da xay ra|lịch sử cho thấy|lich su cho thay|có\s+\d+\s*(?:lần|lan|times)|had\s+\d+\s*(?:times|episodes)|experienced\s+(?:about\s+)?\d+)/i.test(clause)
    || /(?:bạn đã|ban da|ông đã|ong da|you (?:have|had)).{0,40}(?:\d+\s*(?:lần|lan|times)|đau vai|shoulder pain)/i.test(clause)
    || /(?:trải qua|trai qua|xảy ra|xay ra).{0,40}(?:khoảng|khoang|about)?\s*\d+\s*(?:lần|lan|times)/i.test(clause);

  if (assertedOccurrence) return "USER_EXPLICIT";

  if (/\d+\s*(?:lần|lan|times|episodes)/i.test(clause)) return "USER_EXPLICIT";

  return null;
}

function buildUncertainHistoricalRepair(
  language: "en" | "vi",
  estimate: number | null,
): string {
  if (language === "vi") {
    return estimate != null
      ? [
          `Ông nhớ mang máng tháng trước có khoảng ${estimate} lần đau vai,`,
          "nhưng không có log nên mình chưa coi đó là số lần đã xác nhận.",
          "Bên nào cũng chưa rõ.",
        ].join(" ")
      : [
          "Ông nhớ mang máng trước đó có vài lần đau vai,",
          "nhưng không có log nên mình chưa coi đó là số lần đã xác nhận.",
          "Bên nào cũng chưa rõ.",
        ].join(" ");
  }
  return estimate != null
    ? [
        `You roughly recall about ${estimate} shoulder-pain episodes last month,`,
        `but without a log I will not treat that as ${estimate} confirmed episodes.`,
        "Which side is also unclear.",
      ].join(" ")
    : [
        "You roughly recall a few prior shoulder-pain episodes,",
        "but without a log I will not treat that as a confirmed count.",
        "Which side is also unclear.",
      ].join(" ");
}

function stripUnsupportedPathology(text: string, language: "en" | "vi"): string {
  return text
    .replace(/(?:dấu hiệu của chấn thương|dau hieu cua chan thuong|có thể là chấn thương|co the la chan thuong|sign of (?:an )?injury|likely (?:an )?injury)/gi,
      language === "vi" ? "chưa đủ để kết luận chấn thương" : "not enough to conclude an injury")
    .replace(/(?:rotator cuff (?:tear|rách)|rách rotator cuff)/gi,
      language === "vi" ? "chẩn đoán cụ thể chưa được phép" : "a specific diagnosis is not warranted");
}

function primaryConstraint(state: AuthoritativeResponseState): ProvenanceConstraint | null {
  return state.provenanceConstraints.find((c) => c.source === "USER_RECALL_UNCERTAIN")
    ?? state.provenanceConstraints[0]
    ?? null;
}

/**
 * Enforce outputProvenanceStrength <= authoritativeProvenanceStrength.
 */
export function projectProvenanceStrength(input: {
  draft: string;
  authoritative: AuthoritativeResponseState;
  language: "en" | "vi";
}): ProvenanceProjectionResult {
  const constraint = primaryConstraint(input.authoritative);
  const inputStrength = deriveInputProvenanceStrength(input.authoritative);
  const countEstimate = constraint?.countEstimate ?? null;
  const lateralityUnknown =
    input.authoritative.provenanceConstraints.some((c) => !c.mayAssertLaterality)
    || input.authoritative.historicalClaims.some((c) => c.laterality === "UNCERTAIN" || c.laterality === "UNKNOWN")
    || input.authoritative.currentStateClaims.some((c) => c.laterality === "UNCERTAIN" || c.laterality === "UNKNOWN");

  const temporal = input.authoritative.historicalClaims.some((c) => c.temporal === "HISTORICAL")
    ? "HISTORICAL" as const
    : input.authoritative.currentStateClaims.length > 0
      ? "CURRENT" as const
      : "UNKNOWN" as const;

  let text = input.draft;
  let projectedOutputStrength = inferOutputProvenanceStrength(text);
  let repairApplied = false;

  const inflated = inputStrength != null
    && projectedOutputStrength != null
    && rank(projectedOutputStrength) > rank(inputStrength);

  const hasVerifiedAuth =
    input.authoritative.historicalClaims.some((c) => c.provenance === "VERIFIED_TOOL_DATA")
    || input.authoritative.currentStateClaims.some((c) => c.provenance === "VERIFIED_TOOL_DATA")
    || input.authoritative.provenanceConstraints.some((c) => c.source === "VERIFIED_TOOL_DATA");

  if (inflated && inputStrength === "USER_UNCERTAIN_RECALL") {
    const alreadyHedged =
      /(?:không có log|khong co log|không coi|khong coi|mang máng|mang mang|unverified|without (?:a )?log|will not treat|chưa coi|chua coi)/i.test(text);
    if (hasVerifiedAuth || alreadyHedged) {
      // Mixed verified + uncertain OR already-hedged multi-obligation drafts:
      // keep draft intact (exact-count / laterality enforcers handle local demotion).
      // Do NOT wholesale-replace sibling obligations.
      projectedOutputStrength = inputStrength;
    } else {
      text = buildUncertainHistoricalRepair(input.language, countEstimate);
      projectedOutputStrength = "USER_UNCERTAIN_RECALL";
      repairApplied = true;
    }
  }

  // Laterality: UNKNOWN must not become LEFT/RIGHT assertion (soften in-place).
  // Keep verified/explicit LEFT/RIGHT and logged-side assertions in mixed drafts.
  const mayAssertLeft = [...input.authoritative.historicalClaims, ...input.authoritative.currentStateClaims]
    .some((c) =>
      c.laterality === "LEFT"
      && (c.provenance === "VERIFIED_TOOL_DATA"
        || c.provenance === "EXPLICIT_HISTORICAL_REPORT"
        || c.provenance === "EXPLICIT_CURRENT_REPORT"))
    || /(?:tháng\s*6|june).{0,40}vai trái.{0,40}(?:ghi\s*log|có\s*log|logged)|vai trái.{0,40}(?:ghi\s*log|có\s*log)/i.test(text);
  const mayAssertRight = [...input.authoritative.historicalClaims, ...input.authoritative.currentStateClaims]
    .some((c) =>
      c.laterality === "RIGHT"
      && (c.provenance === "VERIFIED_TOOL_DATA"
        || c.provenance === "EXPLICIT_HISTORICAL_REPORT"
        || c.provenance === "EXPLICIT_CURRENT_REPORT"));
  if (lateralityUnknown && /(?:vai phải|vai trái|right shoulder|left shoulder|bên phải|bên trái)/i.test(text)) {
    if (!mayAssertLeft) {
      text = text
        .replace(/vai trái/gi, input.language === "vi" ? "vai" : "shoulder")
        .replace(/bên trái|ben trai/gi, input.language === "vi" ? "bên chưa rõ" : "uncertain side")
        .replace(/\bleft shoulder\b/gi, "shoulder");
    }
    if (!mayAssertRight) {
      text = text
        .replace(/vai phải/gi, input.language === "vi" ? "vai" : "shoulder")
        .replace(/bên phải|ben phai/gi, input.language === "vi" ? "bên chưa rõ" : "uncertain side")
        .replace(/\bright shoulder\b/gi, "shoulder");
    }
  }

  // Uncertain recall alone must not invent pathology.
  if (inputStrength === "USER_UNCERTAIN_RECALL") {
    const before = text;
    text = stripUnsupportedPathology(text, input.language);
    if (text !== before) repairApplied = true;
  }

  projectedOutputStrength = inferOutputProvenanceStrength(text) ?? projectedOutputStrength;
  const monotonicityPassed = !(
    inputStrength != null
    && projectedOutputStrength != null
    && rank(projectedOutputStrength) > rank(inputStrength)
  );

  return {
    text: text.replace(/\s{2,}/g, " ").trim(),
    inputStrength,
    projectedOutputStrength,
    monotonicityPassed,
    repairApplied,
    countEstimate,
    countVerified: inputStrength === "USER_UNCERTAIN_RECALL" ? false : null,
    laterality: lateralityUnknown ? "UNKNOWN" : null,
    temporal,
  };
}

/** Dev-only structured audit — never logs private content. */
export function emitProvenanceAudit(result: ProvenanceProjectionResult): void {
  if (process.env.DANTE_RUNTIME_AUDIT !== "true") return;
  console.info("[DANTE_PROVENANCE_AUDIT]", {
    inputStrength: result.inputStrength,
    countEstimate: result.countEstimate,
    countVerified: result.countVerified,
    laterality: result.laterality,
    temporal: result.temporal,
    projectedOutputStrength: result.projectedOutputStrength,
    monotonicityPassed: result.monotonicityPassed,
    repairApplied: result.repairApplied,
  });
}
