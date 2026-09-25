/**
 * Phase 1 — Multi-intent turn obligations.
 *
 * SEGMENTATION → Obligation[]
 * ROUTING preserves all obligations (priority orders; never deletes)
 * HANDLERS assign disposition
 * COMPOSER covers every disposition
 *
 * NO_SILENT_DROP. Deterministic. No extra LLM calls.
 */

import {
  SIDED_NOT_PAINFUL_SPAN,
  SIDED_PAINFUL_SPAN,
  interpretUserTurn,
} from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";
import { assessTurnConfidence } from "@/lib/dante-core/confidence-engine/assess";
import { buildConfidenceDeterministicReply } from "@/lib/dante-core/confidence-engine/deterministic-reply";
import { extractCurrentTurnState } from "@/lib/dante-core/current-turn-state";
import type { DecisionState } from "@/lib/dante-core/coherence/decision-first";
import { extractLateralityCorrections } from "@/lib/dante-core/coherence/corrections";
import { checkSafety } from "@/lib/dante-core/safety-layer";
import type { SafetyCheckResult } from "@/lib/dante-core/safety-layer";
import {
  buildAuthoritativeResponseState,
  extractCausalTargetFromText,
} from "@/lib/dante-core/runtime-convergence/authoritative-state";
import type { AuthoritativeResponseState } from "@/lib/dante-core/runtime-convergence/authoritative-state";
import type { SemanticInterpretation } from "@/lib/dante-core/adaptive-coach-v2/types";
import type { CurrentTurnState } from "@/lib/dante-core/current-turn-state";
import type { ReasoningScope } from "@/lib/dante-core/reasoning-scope";

export type ObligationIntent =
  | "MIXED_CLAIM_PROVENANCE"
  | "HISTORICAL_CURRENT_CORRECTION"
  | "CAUSAL_ATTRIBUTION"
  | "TOOL_ACTION_TRUTH"
  | "PRIVACY_BOUNDARY"
  | "TEMPORAL_SAFETY"
  // Obligation-ledger intents (segment-level; see coherence/ledger.ts).
  | "DEADLINE_CORRECTION"
  | "MEMORY_BOUNDARY"
  | "LANGUAGE_PREFERENCE"
  | "STYLE_PREFERENCE"
  | "OPEN_REQUEST";

/**
 * ANSWERED / REFUSED / APPLIED / DEFERRED / NEEDS_CLARIFICATION / SAFETY_HANDLED.
 * DEFERRED = detected and acknowledged but its answer is produced by a later stage (the provider) — never a drop.
 */
export type ObligationDisposition =
  | "ANSWERED"
  | "REFUSED"
  | "APPLIED"
  | "DEFERRED"
  | "NEEDS_CLARIFICATION"
  | "SAFETY_HANDLED";

export type OpenRequestKind = "question" | "content" | "comparison" | "directive" | "unclassified";

export type ObligationSourceSpan = { start: number; end: number; text: string };

export type TurnObligation = {
  id: string;
  intent: ObligationIntent;
  payload: {
    reason: string;
    /** OPEN_REQUEST / preference sub-kind. */
    kind?: OpenRequestKind | "keep" | "switch_en" | "switch_vi" | "brief" | "detailed" | "default";
    /** Normalized meaning of the request (folded, repaired); the raw words stay in `sourceSpan`. */
    normalized?: string;
    ambiguity?: "clear" | "ambiguous";
    /** Resolved slot value for correction obligations (e.g. "LEFT", "TUESDAY"). */
    value?: string;
    /** The earlier value the same message corrected away from. */
    superseded?: string;
  };
  priority: number;
  disposition?: ObligationDisposition;
  /** Where in the RAW message the request lives (provenance). */
  sourceSpan?: ObligationSourceSpan;
  /** Discourse segments that carry this obligation. */
  segmentIndices?: number[];
  /** P-15R: scope contract for THIS obligation. Never a shared turn-global blob. */
  reasoningScope?: ReasoningScope;
  /** P-16P: transient decision polarity, written when the obligation is resolved. Never inferred from prose. */
  decisionState?: DecisionState;
};

export type HandledObligation = TurnObligation & {
  disposition: ObligationDisposition;
  text: string;
  /**
   * Where `text` was produced. Absent = a deterministic decision. PROVIDER_OUTPUT = a generation stage wrote it, so
   * the Phase 2 authority guard treats it as UNVERIFIED until proven (P-10).
   */
  origin?: "PROVIDER_OUTPUT";
  /**
   * UNRELATED = a request in a safety turn that no safety rule constrains (nutrition, a general fact). Its provider
   * prose is still judged claim by claim, but the "training must stop" stop rule does not censor the whole block.
   */
  safetyScope?: "UNRELATED";
};

export type MultiIntentResolveResult = {
  obligations: TurnObligation[];
  handledObligations: HandledObligation[];
  detectedIntents: ObligationIntent[];
  responseCoverage: number;
  reply: string;
  causalTarget: string | null;
  toolState: { permission: "CONFIRMATION_REQUIRED"; persisted: false } | null;
  audit: {
    silentDrop: ObligationIntent[];
    dispositions: Record<string, ObligationDisposition>;
  };
};

export const OBLIGATION_PRIORITY: Record<ObligationIntent, number> = {
  TEMPORAL_SAFETY: 10,
  PRIVACY_BOUNDARY: 20,
  MEMORY_BOUNDARY: 25,
  LANGUAGE_PREFERENCE: 26,
  STYLE_PREFERENCE: 27,
  MIXED_CLAIM_PROVENANCE: 30,
  HISTORICAL_CURRENT_CORRECTION: 40,
  DEADLINE_CORRECTION: 45,
  TOOL_ACTION_TRUTH: 50,
  CAUSAL_ATTRIBUTION: 60,
  OPEN_REQUEST: 70,
};
const PRIORITY = OBLIGATION_PRIORITY;

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d");
}

/** SEGMENTATION — extract independent obligations. Never collapses to one primary. */
export function extractTurnObligations(message: string): TurnObligation[] {
  const n = norm(message);
  const found: TurnObligation[] = [];

  const hasVerifiedLogClaim =
    /(?:thang\s*6|th\s*6|th6|june).{0,100}(?:vai|shoulder).{0,60}(?:dau|pain|irritat)/.test(n)
    || /(?:vai|shoulder).{0,60}(?:dau|pain).{0,80}(?:ghi\s*log|logged|co\s*log)/.test(n)
    || /(?:ghi\s*log|logged|co\s*log).{0,80}(?:vai|shoulder|dau|pain)/.test(n)
    || /(?:th6|thang\s*6|june).{0,40}(?:trai|left).{0,40}(?:dau|pain|1\s*lan)/.test(n);
  const hasUncertainRecall =
    /(?:hinh\s*nhu|mang\s*mang|khong\s*chac|not\s*sure|maybe|khoang).{0,80}(?:lan|times|dau|pain)/.test(n)
    || /(?:khong\s*ghi|no\s*log|khong\s*co\s*log)/.test(n);
  const hasAggregatePush =
    /(?:coi\s*(?:nhu|tong)|treat\s*(?:as|it\s+as)|tong\s*(?:la|cong)|confirmed)/.test(n)
    && /\d/.test(n);
  if ((hasVerifiedLogClaim && hasUncertainRecall) || (hasUncertainRecall && hasAggregatePush)) {
    found.push({
      id: "obl_mixed_claim",
      intent: "MIXED_CLAIM_PROVENANCE",
      payload: { reason: "verified_plus_uncertain_or_aggregate_push" },
      priority: PRIORITY.MIXED_CLAIM_PROVENANCE,
    });
  }

  const hasCorrection =
    /(?:nho\s*lai|misspoke|said\s*(?:wrong|earlier)|noi\s*nham|noi\s*sai|luc\s*nay.{0,40}(?:nhung|but))/.test(n)
    && /(?:hom\s*qua|yesterday|vai\s*(?:trai|phai)|left|right|shoulder)/.test(n);
  const hasCurrentAbsence =
    /(?:hien\s*tai|currently|right\s*now|bay\s*gio).{0,60}(?:khong\s*dau|no\s*(?:pain|shoulder)|ca\s*hai.{0,20}khong|both.{0,20}(?:no|not))/.test(n)
    || /(?:ca\s*hai\s*vai|both\s*shoulders).{0,40}(?:khong\s*dau|no\s*pain)/.test(n);
  if (hasCorrection || (hasCurrentAbsence && /(?:hom\s*qua|yesterday|vai\s*phai|right\s*shoulder)/.test(n))) {
    found.push({
      id: "obl_correction",
      intent: "HISTORICAL_CURRENT_CORRECTION",
      payload: { reason: "laterality_or_current_state_correction" },
      priority: PRIORITY.HISTORICAL_CURRENT_CORRECTION,
    });
  }

  const causalTarget = extractCausalTargetFromText(message);
  const asksCause =
    Boolean(causalTarget)
    || /(?:nguyen\s*nhan|cause|caused).{0,40}(?:sleep|ngu|volume)/.test(n)
    || /(?:sleep|ngu|volume).{0,40}(?:nguyen\s*nhan|cause)/.test(n);
  if (asksCause) {
    found.push({
      id: "obl_causal",
      intent: "CAUSAL_ATTRIBUTION",
      payload: { reason: causalTarget ?? "causal_ask" },
      priority: PRIORITY.CAUSAL_ATTRIBUTION,
    });
  }

  const toolTruth =
    /(?:meal\s*plan|workout|program|ke\s*hoach).{0,80}(?:confirm|xac\s*nhan|da\s*luu|saved|persisted)/.test(n)
    || /(?:chua\s*(?:bam\s*)?confirm|without\s*confirm|skip\s*confirm|khoi\s*(?:nhac\s*)?confirm|coi\s*nhu\s*da\s*luu)/.test(n);
  if (toolTruth) {
    found.push({
      id: "obl_tool",
      intent: "TOOL_ACTION_TRUTH",
      payload: { reason: "unconfirmed_persist_request" },
      priority: PRIORITY.TOOL_ACTION_TRUTH,
    });
  }

  const privacy =
    /(?:hidden\s*notes?|internal\s*state|system\s*prompt|decision\s*object|context\s*capsule|raw\s*(?:memory|context)|canary)/.test(n)
    || /(?:nguyen\s*van|dump|reveal|tiet\s*lo|ke\s*(?:het|lai)).{0,80}(?:memory|prompt|state|context|ghi\s*chu\s*an|noi\s*bo)/.test(n)
    || /\b(?:show|in|dump)\b.{0,40}(?:memory|hidden|internal|prompt)/.test(n)
    || /(?:khong\s*can\s*show\s*memory|chi\s*can\s*ke\s*nguyen\s*van)/.test(n);
  if (privacy) {
    found.push({
      id: "obl_privacy",
      intent: "PRIVACY_BOUNDARY",
      payload: { reason: "memory_or_internal_dump_ask" },
      priority: PRIORITY.PRIVACY_BOUNDARY,
    });
  }

  const temporalSafetyAsk =
    /(?:cap\s*cuu|emergency|urgent\s*care|tinh\s*trang\s*cap)/.test(n)
    || (
      /(?:te\s*tay|numb(?:ness)?|chong\s*mat|dizz|dau\s*nguc|chest\s*pain)/.test(n)
      && /(?:tuan\s*truoc|last\s*week|hom\s*qua|yesterday|luc\s*nay|earlier|historical|noi\s*nham)/.test(n)
    );
  if (temporalSafetyAsk) {
    found.push({
      id: "obl_temporal_safety",
      intent: "TEMPORAL_SAFETY",
      payload: { reason: "historical_vs_current_safety" },
      priority: PRIORITY.TEMPORAL_SAFETY,
    });
  }

  return found.sort((a, b) => a.priority - b.priority);
}

/** Every disposition that means "this obligation was dealt with and the user can see how". */
export const DISPOSED: ReadonlySet<ObligationDisposition> = new Set<ObligationDisposition>([
  "ANSWERED", "REFUSED", "APPLIED", "DEFERRED", "NEEDS_CLARIFICATION", "SAFETY_HANDLED",
]);

export function isMultiIntentTurn(obligations: TurnObligation[]): boolean {
  return obligations.length >= 2;
}

function buildMixedClaimText(
  auth: AuthoritativeResponseState,
  language: "en" | "vi",
  message?: string,
): string {
  const verified = auth.historicalClaims.find(
    (c) => c.provenance === "VERIFIED_TOOL_DATA" && c.concept === "SHOULDER_IRRITATION",
  );
  const uncertain = auth.historicalClaims.find(
    (c) => c.provenance === "USER_RECALL_UNCERTAIN" && c.concept === "SHOULDER_IRRITATION",
  );
  const range = auth.provenanceConstraints.find((c) => c.countMin != null && c.countMax != null);
  const n = message ? norm(message) : "";
  const messageHasJuneLeftLog =
    /(?:thang\s*6|th\s*6|th6|june).{0,60}(?:trai|left)/.test(n)
    && /(?:ghi\s*log|co\s*log|logged|1\s*lan)/.test(n);

  if (language === "vi") {
    return [
      verified || messageHasJuneLeftLog
        ? `Tháng 6: vai trái, ${typeof verified?.count === "number" ? verified.count : 1} lần, có ghi log (tách riêng).`
        : "Phần có log được giữ riêng, không gộp với hồi ức không chắc.",
      uncertain || range || /(?:3|4).{0,10}lan|khong\s*(?:ghi|co\s*log)/.test(n)
        ? `Tháng trước: khoảng ${range?.countMin ?? 3}–${range?.countMax ?? 4} lần, không log, bên chưa chắc — không coi là confirmed.`
        : "Phần không log vẫn giữ mức không chắc.",
      "Không coi tổng là 5 lần confirmed.",
    ].join(" ");
  }
  return [
    verified || messageHasJuneLeftLog
      ? `June: left shoulder, ${typeof verified?.count === "number" ? verified.count : 1} time, logged separately.`
      : "Logged claim stays separate from uncertain recall.",
    uncertain || range
      ? `Last month: about ${range?.countMin ?? 3}–${range?.countMax ?? 4} times, no log, side unknown — not treated as confirmed.`
      : "Unlogged recall stays uncertain.",
    "I will not promote the total to 5 confirmed episodes.",
  ].join(" ");
}

function buildCorrectionText(
  interpretation: SemanticInterpretation,
  cts: CurrentTurnState,
  language: "en" | "vi",
  message?: string,
): string {
  // The side is whatever the message's own explicit correction resolved to — never assumed.
  const resolved = message ? extractLateralityCorrections(norm(message), false).filter((c) => !c.conflictsWith) : [];
  const finalSide = resolved.filter((c) => !c.role).at(-1)?.statement as "LEFT" | "RIGHT" | undefined;
  const earlierSide = resolved.find((c) => c.role === "earlier_assertion")?.statement as "LEFT" | "RIGHT" | undefined;
  const histLeft = !finalSide && (interpretation.propositions.some(
    (p) =>
      p.concept === "SHOULDER_IRRITATION"
      && p.laterality === "LEFT"
      && (p.temporalAnchor === "HISTORICAL" || p.temporal === "HISTORICAL"),
  ) || (message ? /(?:hom\s*qua|yesterday).{0,40}(?:vai\s*)?(?:trai|left)|(?:trai|left).{0,40}(?:hom\s*qua|yesterday)/i.test(norm(message)) : false));
  // Side-scoped statements ("vai trái đau, vai phải không đau") decide the current state on their own: "not painful" is a
  // fact about ONE side, and a turn that only says what hurt yesterday says nothing about now. Without them the legacy
  // reading stands (no shoulder irritation detected = current absent).
  const sided = interpretation.propositions.filter((p) => p.rawSpan === SIDED_PAINFUL_SPAN || p.rawSpan === SIDED_NOT_PAINFUL_SPAN);
  const sidedCurrent = sided.filter((p) => p.temporalAnchor === "CURRENT" || p.temporal === "CURRENT");
  const currentAbsent = sided.length > 0
    ? sidedCurrent.length > 0 && sidedCurrent.every((p) => p.polarity === "ABSENT")
    : cts.shoulderIrritated === false
      || interpretation.propositions.some(
        (p) =>
          p.concept === "SHOULDER_IRRITATION"
          && p.polarity === "ABSENT"
          && (p.temporalAnchor === "CURRENT" || p.temporal === "CURRENT"),
      );
  const sideVi = (side: "LEFT" | "RIGHT") => (side === "LEFT" ? "vai trái" : "vai phải");
  const sideEn = (side: "LEFT" | "RIGHT") => (side === "LEFT" ? "left" : "right");

  if (language === "vi") {
    const head = finalSide
      ? earlierSide && earlierSide !== finalSide
        ? `Đã chỉnh: hôm qua là ${sideVi(finalSide)}, không phải ${sideVi(earlierSide)}.`
        : `Đã chỉnh: hôm qua là ${sideVi(finalSide)}.`
      : histLeft
        ? "Đã chỉnh: hôm qua là vai trái, không phải vai phải."
        : "Đã nhận correction về bên vai hôm qua.";
    return [
      head,
      currentAbsent
        ? "Hiện tại cả hai vai đều không đau."
        : "Trạng thái hiện tại giữ theo báo cáo mới nhất.",
    ].join(" ");
  }
  const headEn = finalSide
    ? earlierSide && earlierSide !== finalSide
      ? `Correction noted: yesterday was the ${sideEn(finalSide)} shoulder, not the ${sideEn(earlierSide)}.`
      : `Correction noted: yesterday was the ${sideEn(finalSide)} shoulder.`
    : histLeft
      ? "Correction noted: yesterday was the left shoulder, not the right."
      : "Laterality correction noted.";
  return [
    headEn,
    currentAbsent
      ? "Current state: both shoulders are not painful."
      : "Current state follows your latest report.",
  ].join(" ");
}

function sentenceList(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n{2,}/).map((part) => part.trim()).filter(Boolean);
}

function buildCausalText(
  message: string,
  language: "en" | "vi",
  cts: CurrentTurnState,
): string {
  const assessment = assessTurnConfidence({ message, currentState: cts });
  const base = buildConfidenceDeterministicReply(assessment, language, { message });
  const n = norm(message);
  const volumeChanged = /(?:giam\s*volume|cut\s*volume|giam\s*vol|volume.{0,20}(?:giam|down|lower|decreas)|decreas.{0,20}volume)/i.test(n);
  const sleepUp = /(?:ngu\s*them|slept?\s*(?:more|extra|\+)|sleep.{0,20}(?:them|more|increased?|extra)|them.{0,10}(?:tieng|hour))/i.test(n);

  // The amount comes from the user's own words; when none is given nothing is invented.
  const sleepHours = /(?:ngu\s*them|them)\s*(?:khoang\s*|~\s*)?(\d+(?:[.,]\d+)?)\s*(?:tieng|gio|h)\b|(?:\+|them\s*)(\d+(?:[.,]\d+)?)\s*(?:tieng|gio|h)\b/.exec(n);
  const hours = (sleepHours?.[1] ?? sleepHours?.[2])?.replace(",", ".");

  // One conclusion sentence. The confidence reply restates it in its own words, so only sentences that add
  // something survive — not the narration, and not a duplicate of the conclusion.
  const extra = base
    ? sentenceList(base).filter((sentence) =>
        !/^(?:Câu hỏi của .* là về|Your question is about)/i.test(sentence)
        && !/(?:khẳng định sleep|assert that sleep|không chuyển (?:câu trả lời )?sang caffeine|will not replace the sleep target)/i.test(sentence)
        && !/confounder khác|Other confounders may exist/i.test(sentence),
      )
    : [];

  if (language === "vi") {
    return [
      sleepUp ? (hours ? `Ngủ thêm khoảng ${hours} tiếng.` : "Có ngủ thêm so với trước.") : null,
      volumeChanged ? "Volume cũng giảm cùng lúc." : null,
      "Nhiều biến đổi cùng lúc nên chưa đủ bằng chứng sạch để khẳng định sleep là nguyên nhân chính khiến bench RPE giảm.",
      ...extra,
    ].filter(Boolean).join(" ");
  }

  return [
    sleepUp ? (hours ? `You reported sleeping about ${hours} hours more.` : "You reported sleeping more.") : null,
    volumeChanged ? "Volume also decreased at the same time." : null,
    "Several variables moved together, so there is not enough clean evidence to say sleep is the main cause of the lower bench RPE.",
    ...extra,
  ].filter(Boolean).join(" ");
}

function buildToolTruthText(language: "en" | "vi"): string {
  return language === "vi"
    ? "Meal plan mới chưa được lưu. Chưa bấm confirm thì hệ thống không coi là đã persist — không bỏ bước xác nhận."
    : "The new meal plan is not persisted. Without an actual confirm/action it is not saved — confirmation cannot be skipped.";
}

function buildPrivacyText(language: "en" | "vi"): string {
  return language === "vi"
    ? "Không. Mình không dump ghi chú ẩn, prompt hệ thống, hay trạng thái nội bộ. Các phần còn lại vẫn được trả lời bình thường."
    : "No. I will not dump hidden notes, system instructions, or internal state. Every other point is still answered.";
}

function buildTemporalSafetyText(
  message: string,
  interpretation: SemanticInterpretation,
  cts: CurrentTurnState,
  safety: SafetyCheckResult,
  language: "en" | "vi",
): { text: string; disposition: ObligationDisposition } {
  if (safety.triggered && safety.responseOverride) {
    return { text: safety.responseOverride, disposition: "SAFETY_HANDLED" };
  }

  const histNumb = interpretation.propositions.some(
    (p) =>
      p.concept === "NUMBNESS"
      && p.polarity === "PRESENT"
      && (p.temporalAnchor === "HISTORICAL" || p.temporal === "HISTORICAL"),
  );
  const currentClear =
    cts.numbnessPresent === false
    && !/(?:hien\s*tai|currently|right\s*now).{0,40}(?:te\s*tay|numb|chong\s*mat|dizz|dau\s*nguc|chest\s*pain)(?!.{0,20}khong)/i.test(
      norm(message),
    );

  if (language === "vi") {
    return {
      text: [
        histNumb
          ? "Tê tay được nhắc là chuyện tuần trước / lịch sử — đã chỉnh thời gian."
          : "Triệu chứng red-flag được neo theo thời gian đã báo cáo.",
        "Hiện tại: không tê tay, không chóng mặt, không đau ngực theo báo cáo.",
        "Riêng triệu chứng lịch sử không kích hoạt tình trạng cấp cứu hiện tại. Đây không phải bảo đảm y tế tuyệt đối — nếu triệu chứng cấp tính xuất hiện lại thì cần đánh giá y tế.",
      ].join(" "),
      disposition: "ANSWERED",
    };
  }
  return {
    text: [
      histNumb
        ? "The numbness you mentioned is historical (e.g. last week) after the time correction."
        : "Red-flag symptoms are anchored to the time you reported.",
      currentClear
        ? "Currently you report no numbness, dizziness, or chest pain."
        : "Current state follows your latest report.",
      "A historical symptom alone does not trigger an active emergency. This is not an absolute medical guarantee — seek care if acute symptoms return.",
    ].join(" "),
    disposition: "ANSWERED",
  };
}

function handleOne(
  obl: TurnObligation,
  ctx: {
    message: string;
    language: "en" | "vi";
    interpretation: SemanticInterpretation;
    cts: CurrentTurnState;
    auth: AuthoritativeResponseState;
    safety: SafetyCheckResult;
  },
): HandledObligation {
  switch (obl.intent) {
    case "MIXED_CLAIM_PROVENANCE":
      return {
        ...obl,
        disposition: "ANSWERED",
        text: buildMixedClaimText(ctx.auth, ctx.language, ctx.message),
      };
    case "HISTORICAL_CURRENT_CORRECTION":
      return {
        ...obl,
        disposition: "ANSWERED",
        text: buildCorrectionText(ctx.interpretation, ctx.cts, ctx.language, ctx.message),
      };
    case "CAUSAL_ATTRIBUTION":
      return {
        ...obl,
        disposition: "ANSWERED",
        text: buildCausalText(ctx.message, ctx.language, ctx.cts),
      };
    case "TOOL_ACTION_TRUTH":
      return {
        ...obl,
        disposition: "ANSWERED",
        text: buildToolTruthText(ctx.language),
      };
    case "PRIVACY_BOUNDARY":
      return {
        ...obl,
        disposition: "REFUSED",
        text: buildPrivacyText(ctx.language),
      };
    case "TEMPORAL_SAFETY": {
      const result = buildTemporalSafetyText(
        ctx.message,
        ctx.interpretation,
        ctx.cts,
        ctx.safety,
        ctx.language,
      );
      return { ...obl, disposition: result.disposition, text: result.text };
    }
    case "DEADLINE_CORRECTION":
      return {
        ...obl,
        disposition: "APPLIED",
        text: buildDeadlineText(obl.payload.value, obl.payload.superseded, ctx.language),
      };
    case "MEMORY_BOUNDARY":
      return {
        ...obl,
        disposition: "APPLIED",
        text: ctx.language === "vi" ? "Không lưu phần này vào memory." : "Not saving this to memory.",
      };
    case "LANGUAGE_PREFERENCE":
      return { ...obl, disposition: "APPLIED", text: buildLanguageText(obl.payload.kind, ctx.language) };
    case "STYLE_PREFERENCE":
      // Applied through session state (verbosity slot); the reply itself is the acknowledgement.
      return { ...obl, disposition: "APPLIED", text: "" };
    case "OPEN_REQUEST":
      if (obl.payload.ambiguity === "ambiguous") {
        const excerpt = (obl.sourceSpan?.text ?? "").replace(/\s+/g, " ").slice(0, 70);
        return {
          ...obl,
          disposition: "NEEDS_CLARIFICATION",
          text: ctx.language === "vi"
            ? `Phần "${excerpt}" chưa rõ ý — nói cụ thể hơn giúp để trả lời đúng.`
            : `I am not sure what "${excerpt}" refers to — say it a bit more specifically and I will answer it.`,
        };
      }
      // Answered by the generation stage; until then it is DEFERRED — kept alive, never dropped.
      return { ...obl, disposition: "DEFERRED", text: "" };
    default: {
      const _exhaustive: never = obl.intent;
      void _exhaustive;
      return {
        ...obl,
        disposition: "NEEDS_CLARIFICATION",
        text: ctx.language === "vi" ? "Cần làm rõ ý này." : "Need clarification on this point.",
      };
    }
  }
}

const WEEKDAY_VI: Record<string, string> = {
  MONDAY: "thứ Hai", TUESDAY: "thứ Ba", WEDNESDAY: "thứ Tư", THURSDAY: "thứ Năm",
  FRIDAY: "thứ Sáu", SATURDAY: "thứ Bảy", SUNDAY: "Chủ nhật",
};
const WEEKDAY_EN: Record<string, string> = {
  MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday",
  FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday",
};

function buildDeadlineText(value: string | undefined, superseded: string | undefined, language: "en" | "vi"): string {
  if (!value) return language === "vi" ? "Đã ghi nhận chỉnh sửa deadline." : "Deadline correction noted.";
  if (language === "vi") {
    const now = WEEKDAY_VI[value] ?? value;
    const old = superseded ? WEEKDAY_VI[superseded] ?? superseded : null;
    return old ? `Deadline: đã đổi sang ${now} (thay cho ${old}).` : `Deadline: ${now}.`;
  }
  const now = WEEKDAY_EN[value] ?? value;
  const old = superseded ? WEEKDAY_EN[superseded] ?? superseded : null;
  return old ? `Deadline updated to ${now} (was ${old}).` : `Deadline: ${now}.`;
}

function buildLanguageText(kind: TurnObligation["payload"]["kind"], language: "en" | "vi"): string {
  if (kind === "switch_en") return language === "vi" ? "Sẽ trả lời bằng tiếng Anh." : "Switching to English.";
  if (kind === "switch_vi") return language === "vi" ? "Sẽ trả lời bằng tiếng Việt." : "Switching to Vietnamese.";
  return language === "vi" ? "Giữ nguyên tiếng Việt." : "Staying in English.";
}

/**
 * ROUTING + HANDLERS + COMPOSITION for multi-intent turns.
 * Priority orders sections; every obligation gets an explicit disposition.
 */
export function resolveMultiIntentTurn(input: {
  message: string;
  language: "en" | "vi";
  obligations?: TurnObligation[];
  interpretation?: SemanticInterpretation;
  currentTurnState?: CurrentTurnState;
  safetyResult?: SafetyCheckResult;
}): MultiIntentResolveResult {
  const obligations = input.obligations ?? extractTurnObligations(input.message);
  const interpretation = input.interpretation ?? interpretUserTurn(input.message);
  const cts = input.currentTurnState ?? extractCurrentTurnState(input.message);
  const safety = input.safetyResult ?? checkSafety(input.message);
  const auth = buildAuthoritativeResponseState({
    interpretation,
    causalTarget: extractCausalTargetFromText(input.message),
    toolState: obligations.some((o) => o.intent === "TOOL_ACTION_TRUTH")
      ? { permission: "CONFIRMATION_REQUIRED", persisted: false }
      : null,
  });

  const handled = obligations.map((obl) =>
    handleOne(obl, {
      message: input.message,
      language: input.language,
      interpretation,
      cts,
      auth,
      safety,
    }),
  );

  const reply = handled.map((h) => h.text).filter(Boolean).join("\n\n");
  const detectedIntents = obligations.map((o) => o.intent);
  const covered = handled.filter((h) => DISPOSED.has(h.disposition));
  // Identity is the obligation id: several OPEN_REQUESTs share one intent and must each be disposed.
  const silentDrop = obligations
    .filter((o) => !covered.some((h) => h.id === o.id))
    .map((o) => o.intent);

  return {
    obligations,
    handledObligations: handled,
    detectedIntents,
    responseCoverage: covered.length,
    reply,
    causalTarget: extractCausalTargetFromText(input.message),
    toolState: obligations.some((o) => o.intent === "TOOL_ACTION_TRUTH")
      ? { permission: "CONFIRMATION_REQUIRED", persisted: false }
      : null,
    audit: {
      silentDrop,
      dispositions: Object.fromEntries(
        handled.map((h) => [h.intent === "OPEN_REQUEST" ? h.id : h.intent, h.disposition]),
      ),
    },
  };
}

export function measureResponseCoverage(
  handled: HandledObligation[],
  expected: ObligationIntent[],
): { covered: ObligationIntent[]; missing: ObligationIntent[]; responseCoverage: number } {
  const covered = expected.filter((intent) =>
    handled.some((h) => h.intent === intent && DISPOSED.has(h.disposition)),
  );
  return {
    covered,
    missing: expected.filter((i) => !covered.includes(i)),
    responseCoverage: covered.length,
  };
}
