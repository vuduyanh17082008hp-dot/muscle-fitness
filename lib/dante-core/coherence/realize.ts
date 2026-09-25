/**
 * Phase 2 — persona, language, continuity, repetition, composition.
 * Surface only. Never mutates Phase 1 facts/dispositions.
 */

import { createHash } from "node:crypto";
import { normalizeForFingerprint } from "@/lib/dante-core/runtime-convergence/fingerprint";
import { scrubInternalJargon } from "@/lib/dante-core/adaptive-coach-v2/natural-response/jargon-policy";
import { detectTemplateAttractor } from "@/lib/dante-core/adaptive-coach-v2/natural-response/repetition-detector";
import type { HandledObligation } from "@/lib/dante-core/runtime-convergence/multi-intent";
import { activeBoundaries, activeCorrections, relevantOpenLoops } from "@/lib/dante-core/coherence/reducer";
import { applyDecisionFirst, type DecisionState } from "@/lib/dante-core/coherence/decision-first";
import { applyEvidenceLite } from "@/lib/dante-core/coherence/evidence-lite";
import { applyAccessiblePresentation, resolveAccessibleProfile } from "@/lib/dante-core/coherence/presentation";
import { applyPersonalPt } from "@/lib/dante-core/coherence/personal-pt";
import { applyAddressToText, hasCustomerServiceDrift, stripCustomerService } from "@/lib/dante-core/coherence/style";
import { applyFamiliarity } from "@/lib/dante-core/coherence/expression";
import { removeOutOfPlanVocatives, stripHumorMarkers } from "@/lib/dante-core/coherence/persona-gate";
import { blockSurfaceText, decisionBlock, providerBlock, semanticBlock } from "@/lib/dante-core/coherence/authority";
import type {
  AddressForm,
  ExpressionPlan,
  ResponseBlock,
  ResponseStrategy,
  SafetyFollowUp,
  SafetyPhase,
  TurnAnalysis,
  VersionedState,
} from "@/lib/dante-core/coherence/types";

export function adviceSignature(text: string, target: string, tone: string): string {
  const core = normalizeForFingerprint(text).split(" ").slice(0, 24).join(" ");
  return createHash("sha256").update(`${core}|${target}|${tone}`).digest("hex").slice(0, 24);
}

export function questionSignature(text: string): string {
  return createHash("sha256").update(normalizeForFingerprint(text)).digest("hex").slice(0, 24);
}

export function classifyRepetition(input: {
  snapshot: VersionedState;
  message: string;
  draft: string;
  analysis: TurnAnalysis;
  safetyPhase: SafetyPhase;
}): {
  action: "repeat" | "clarify" | "rephrase" | "change_angle" | "shorten" | "suppress_warning" | "none";
  signature: string;
} {
  const signature = adviceSignature(input.draft, input.analysis.intents.join(",") || "general", "calm");
  const qSig = questionSignature(input.message);
  const sameQuestion = input.snapshot.lastUserQuestionSignature === qSig;
  const sameAdvice = input.snapshot.lastAdviceSignature === signature
    || input.snapshot.adviceSignatures.includes(signature);

  if (input.analysis.unclearPriorAsk || input.snapshot.lastAnswerUnclear && sameQuestion) {
    return { action: "clarify", signature };
  }
  const safetyActive = input.safetyPhase === "ENTER" || input.safetyPhase === "PERSIST" || input.safetyPhase === "ESCALATE";
  if (safetyActive && input.snapshot.safetyWarningSignature && input.snapshot.safetyWarningCount >= 1) {
    return { action: "suppress_warning", signature };
  }
  if (sameQuestion && sameAdvice) return { action: "rephrase", signature };
  if (sameAdvice) return { action: "shorten", signature };
  const attractor = detectTemplateAttractor([], {
    previousFingerprint: input.snapshot.lastAdviceSignature
      ? { responseIntent: "COACH", rationaleCodes: [input.snapshot.lastAdviceSignature] }
      : null,
    draftReply: input.draft,
  });
  if (attractor.templateAttractor) return { action: "change_angle", signature };
  return { action: "none", signature };
}

function humorBudget(text: string, safetyPhase: SafetyPhase): string {
  const safetyActive = safetyPhase === "ENTER" || safetyPhase === "PERSIST" || safetyPhase === "ESCALATE";
  if (!safetyActive) return text;
  return text.replace(/[😂🤣💀😭]/g, "").replace(/\b(?:haha+|lol|lmao)\b/gi, "").replace(/\s{2,}/g, " ").trim();
}

function naturalJoin(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return parts.join("\n\n");
}

type ComposeInput = {
  handled: HandledObligation[];
  strategies: ResponseStrategy[];
  analysis: TurnAnalysis;
  snapshot: VersionedState;
  language: "en" | "vi";
  safetyPhase: SafetyPhase;
  competingCorrections: boolean;
  phase1Draft: string;
  message: string;
  /**
   * Who wrote `phase1Draft` when there are no handled obligations to carry it. Defaults to a deterministic decision;
   * a provider reply MUST say PROVIDER_OUTPUT (finalizeProviderReply does) — its blocks are then born UNVERIFIED.
   */
  draftSource?: "DETERMINISTIC_DECISION" | "PROVIDER_OUTPUT";
};

/**
 * The reply as structured blocks, BEFORE persona realization. Every handled obligation contributes a block that keeps
 * its own id/disposition and its own SOURCE (a handled obligation that a provider wrote is a PROVIDER_OUTPUT block);
 * composed lines that are not obligations get a stable `composed:*` handle and come from settled state. Authority is
 * NOT decided here: `authorizeBlocks` (authority.ts) does that, and both realizations render through it — the
 * fallback renders these blocks, never the failed surface text, so no meaning has to be recovered from prose.
 */
export function composeResponseBlocks(input: ComposeInput): ResponseBlock[] {
  const blocks: ResponseBlock[] = [];
  const addComposed = (obligationId: string, text: string): void => {
    if (text) blocks.push(semanticBlock(obligationId, text));
  };
  const addHandled = (h: HandledObligation): void => {
    if (!h.text) return;
    const block = h.origin === "PROVIDER_OUTPUT"
      ? providerBlock(h.id, h.disposition, h.text)
      : decisionBlock(h.id, h.disposition, h.text);
    if (h.decisionState) block.decisionState = h.decisionState;
    blocks.push(block);
  };
  const addDraft = (text: string): void => {
    if (!text) return;
    const block = input.draftSource === "PROVIDER_OUTPUT"
      ? providerBlock("draft", "COMPOSED", text)
      : decisionBlock("draft", "COMPOSED", text);
    const open = input.analysis.obligations.filter((o) => o.intent === "OPEN_REQUEST");
    if (open.length === 1 && open[0]?.decisionState) block.decisionState = open[0].decisionState;
    blocks.push(block);
  };
  const finish = (): ResponseBlock[] => blocks.map((block, order) => ({ ...block, order }));

  if (input.competingCorrections) {
    const clarify = input.language === "vi"
      ? "Hai correction đang lệch nhau. Nói lại giúp một lần: hôm qua là vai trái hay vai phải?"
      : "Those two corrections disagree. Say it once: was yesterday the left or the right shoulder?";
    addComposed("composed:competing_corrections", clarify);
    if (input.handled.length > 0) {
      for (const h of input.handled.filter((x) => x.intent !== "HISTORICAL_CURRENT_CORRECTION")) addHandled(h);
    } else {
      addDraft(input.phase1Draft.trim());
    }
    return finish();
  }

  if (input.strategies.includes("ACKNOWLEDGE_CORRECTION") && input.analysis.corrections.length > 0) {
    const latest = input.analysis.corrections.filter((c) => !c.conflictsWith).at(-1);
    const alreadyNoted = /correction noted|đã chỉnh|đã ghi nhận chỉnh sửa|ghi nhận correction/i.test(input.phase1Draft);
    if (latest && !alreadyNoted) {
      addComposed("composed:correction_ack", input.language === "vi"
        ? "Đã ghi nhận chỉnh sửa — bản mới nhất là bản được giữ."
        : "Correction noted — the latest version stated is the one that stands.");
    }
  }
  if (input.handled.length > 0) {
    for (const h of input.handled) addHandled(h);
  } else {
    addDraft(input.phase1Draft.trim());
  }

  const loops = relevantOpenLoops(input.snapshot);
  const returnLoop = loops.find((l) => l.topic !== "clarification" && l.status === "ACTIVE")
    ?? loops.find((l) => l.status === "ACTIVE");
  if (input.analysis.unclearPriorAsk && returnLoop) {
    // Loop topics are internal handles (intent enums, "task"); never render them. Point at the thread instead.
    addComposed("composed:return_thread", input.language === "vi"
      ? "Quay lại đúng mạch — câu hỏi trước đó."
      : "Back to the open thread — your previous question.");
  }

  const activeCorr = activeCorrections(input.snapshot);
  const laterality = activeCorr.find((c) => c.value.topic === "yesterday_shoulder_laterality");
  if (laterality && /hom qua|hôm qua|yesterday|vai|shoulder/i.test(input.message)) {
    const side = laterality.value.statement;
    // The slot also holds a side the user simply stated ("vai phải"). Only claim "yesterday" when this very message
    // says so — otherwise state the side, which is true either way.
    const yesterday = /hom qua|hôm qua|yesterday/i.test(input.message);
    // Only text that can actually surface counts as "already said" (a provider block awaiting authority does not).
    const soFar = blocks.filter((b) => b.source !== "PROVIDER_OUTPUT").map((b) => b.text).join(" ");
    if (side === "LEFT" && !/(?:vai\s*)?trái|left/i.test(soFar)) {
      addComposed("composed:laterality", input.language === "vi"
        ? `Vẫn giữ nguyên: ${yesterday ? "hôm qua là " : ""}vai trái.`
        : `Correction still stands: ${yesterday ? "yesterday was " : "it is "}the left shoulder.`);
    }
    if (side === "RIGHT" && !/(?:vai\s*)?phải|right/i.test(soFar)) {
      addComposed("composed:laterality", input.language === "vi"
        ? `Vẫn giữ nguyên: ${yesterday ? "hôm qua là " : ""}vai phải.`
        : `Correction still stands: ${yesterday ? "yesterday was " : "it is "}the right shoulder.`);
    }
  }

  const safetyActive = input.safetyPhase === "ENTER"
    || input.safetyPhase === "PERSIST"
    || input.safetyPhase === "ESCALATE";
  const lectureBound = input.analysis.boundaries.some((b) => b.kind === "no_lecturing")
    || activeBoundaries(input.snapshot).some((b) => b.value.kind === "no_lecturing");
  const jargonBound = input.analysis.boundaries.some((b) => b.kind === "no_jargon")
    || activeBoundaries(input.snapshot).some((b) => b.value.kind === "no_jargon");
  if (safetyActive && (lectureBound || jargonBound)) {
    blocks.unshift(semanticBlock(
      "composed:safety_boundary_note",
      input.language === "vi"
        ? "Safety lúc này cần nói thẳng hơn boundary đó — chỉ đúng phần nguy hiểm, các ý còn lại vẫn giữ."
        : "Safety needs a direct warning on the danger slice only; the rest of your constraints still stand.",
    ));
  }
  return finish();
}

/** Join through the ONE surface contract: a block that lacks authority contributes its neutral acknowledgement, never its text. */
export function joinResponseBlocks(blocks: readonly ResponseBlock[], language: "en" | "vi"): string {
  return naturalJoin(blocks.map((b) => blockSurfaceText(b, language)).filter(Boolean));
}

/**
 * Text that a "brief" preference must never remove: truth notices about unsaved/unconfirmed changes and any
 * safety/medical direction. Brevity is a surface preference, not permission to drop a warning or a disclosure.
 */
const BRIEF_PROTECTED = /chưa (?:được )?(?:lưu|xác nhận)|not (?:been )?(?:saved|confirmed)|pending confirmation|\b(?:stop|urgent|emergency|medical)\b|(?:dừng|khẩn|cấp cứu|y tế)|không dump|will not dump|không lưu|not saving|\?\s*$/i;
const BRIEF_MAX_BLOCKS = 2;
const BRIEF_MAX_LIST_LINES = 3;
const LIST_LINE = /^\s*(?:[-*•]|\d+[.)])\s/;

function clampToBrief(text: string): string {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const kept = blocks.filter((block, index) => index < BRIEF_MAX_BLOCKS || BRIEF_PROTECTED.test(block));
  return kept
    .map((block) => {
      const lines = block.split("\n");
      const isList = lines.length > BRIEF_MAX_LIST_LINES && lines.filter((l) => LIST_LINE.test(l)).length >= 2;
      return isList ? lines.slice(0, BRIEF_MAX_LIST_LINES).join("\n") : block;
    })
    .join("\n\n");
}

export function realizePersona(input: {
  draft: string;
  language: "en" | "vi";
  address: AddressForm;
  safetyPhase: SafetyPhase;
  snapshot: VersionedState;
  /** Current user message — used only for P-16 decision-first realization. */
  message?: string;
  repetitionAction: "repeat" | "clarify" | "rephrase" | "change_angle" | "shorten" | "suppress_warning" | "none";
  /**
   * Number of Phase 1 obligations this reply answers. A multi-obligation reply is never shortened by paragraph:
   * dropping a block would silently drop an obligation.
   */
  handledCount?: number;
  /**
   * The turn's ExpressionPlan. It carries the resolved verbosity (a TURN override included, a safety floor applied),
   * the humor allowance and the familiarity register. Omitted -> the persisted profile projection is used.
   */
  /** P-16U: upstream semantic category. Absent/NONE = do not upgrade certainty. */
  decisionState?: DecisionState | null;
  allowedFactors?: readonly string[];
  plan?: ExpressionPlan;
  /** Safety-layer category when known. HARD_BLOCK copy is left untouched. */
  safetyCategory?: string | null;
}): string {
  let text = scrubInternalJargon(input.draft, input.language);
  text = stripCustomerService(text);
  text = applyDecisionFirst({
    draft: text,
    decisionState: input.decisionState,
    allowedFactors: input.allowedFactors,
    message: input.message,
    language: input.language,
    plan: input.plan,
    handledCount: input.handledCount,
    safetyPhase: input.safetyPhase,
  });
  text = applyEvidenceLite({
    draft: text,
    language: input.language,
    hasVerifiedData: /\brecovery(?:\s+score)?\s*(?:is|was|at|=)?\s*\d+\b/i.test(input.message ?? ""),
    hasUserState: /\brecovery\b|\bslept\b|\bsleep\b|\bngu\b/i.test(input.message ?? ""),
  });
  if (input.plan) {
    text = applyAccessiblePresentation(text, resolveAccessibleProfile({
      message: input.message ?? "",
      language: input.language,
      plan: input.plan,
      snapshot: input.snapshot,
    }), input.message ?? "");
  }
  text = humorBudget(text, input.safetyPhase);
  if (input.plan && !input.plan.allowHumorMarkers) text = stripHumorMarkers(text);
  // A vocative outside the plan goes with its punctuation frame; only then is the address form applied to pronouns.
  if (input.plan) text = removeOutOfPlanVocatives(text, input.plan, input.language);
  text = applyAddressToText(text, input.address, input.language);
  // Register (rhythm/contractions) is separate from address: familiarity never chooses a pronoun.
  if (input.plan) text = applyFamiliarity(text, input.plan.familiarity, input.language);

  const safetyActive = input.safetyPhase === "ENTER" || input.safetyPhase === "PERSIST" || input.safetyPhase === "ESCALATE";
  const brief = input.plan ? input.plan.verbosity === "BRIEF" : input.snapshot.verbosity.value === "brief";
  if (brief && !safetyActive && (input.handledCount ?? 0) <= 1) {
    text = clampToBrief(text);
  }
  if ((input.repetitionAction === "shorten" || input.repetitionAction === "suppress_warning") && (input.handledCount ?? 0) <= 1) {
    const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    text = paras.slice(0, Math.min(2, paras.length)).join("\n\n");
  }
  if (input.repetitionAction === "rephrase" || input.repetitionAction === "clarify") {
    const lead = input.language === "vi"
      ? "Nói lại cho rõ, không vòng:"
      : "Clearer this time, no loop:";
    if (!text.startsWith(lead)) text = `${lead} ${text}`;
  }
  if (input.repetitionAction === "change_angle") {
    const lead = input.language === "vi" ? "Góc khác:" : "Different angle:";
    if (!text.startsWith(lead)) text = `${lead} ${text}`;
  }

  const noJargon = activeBoundaries(input.snapshot).some((b) => b.value.kind === "no_jargon");
  if (noJargon) {
    text = text.replace(/\b(?:epistemic|provenance|monotonicity|obligation coverage)\b/gi, "");
  }

  text = applyPersonalPt({
    draft: text,
    message: input.message,
    language: input.language,
    familiarity: input.plan?.familiarity,
    safetyPhase: input.safetyPhase,
    safetyCategory: input.safetyCategory ?? input.snapshot.safety.category,
    handledCount: input.handledCount,
    verbosity: input.plan?.verbosity,
  });

  return text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export { hasCustomerServiceDrift };

export function hasQuestionNumbering(text: string): boolean {
  return /(?:question|câu hỏi)\s*[123]|^\s*[123][\.)]\s/im.test(text);
}

export type SafetyContinuation = {
  draft: string;
  activityDirective: "STOP" | "MODIFY";
  evaluationUrgency: "URGENT" | "EMERGENCY" | "ROUTINE";
};

const MEDICAL_CATEGORIES = new Set(["chest_pain_cardiac", "fainting_dizziness", "neurological_symptoms", "severe_pain"]);

/**
 * Reply for a turn whose safety state is carried by the persisted lifecycle rather than by fresh red-flag wording
 * ("still there", "getting worse"). The persisted phase — not the model — decides what such a turn may say, so
 * the provider is never asked to coach through an unresolved symptom. Copy is intentionally pronoun-free
 * (except the crisis line, which mirrors the existing crisis copy) so it cannot drift on address form.
 */
export function buildSafetyContinuation(input: {
  language: "en" | "vi";
  phase: SafetyPhase;
  category: string | null;
  /** What the user said about the symptom this turn; null = nothing (silence is not resolution). */
  evidence?: SafetyFollowUp | null;
  /** The episode was carried across a long gap (time alone never resolves it). */
  afterGap?: boolean;
}): SafetyContinuation {
  const vi = input.language === "vi";
  const escalated = input.phase === "ESCALATE";

  if (input.category === "self_harm_crisis") {
    return {
      activityDirective: "STOP",
      evaluationUrgency: "EMERGENCY",
      draft: vi
        ? "Mình vẫn ở đây với bạn, và điều này quan trọng hơn chuyện tập luyện. Nếu bạn có thể hành động theo những ý nghĩ này hoặc thấy không giữ an toàn được, hãy gọi số cấp cứu hoặc đường dây hỗ trợ khủng hoảng ngay và ở gần người bạn tin tưởng. Nếu chưa khẩn cấp, hôm nay hãy liên hệ người bạn tin hoặc chuyên gia sức khỏe tâm thần."
        : "I'm still here, and this matters more than training. If you might act on these thoughts or feel unable to stay safe, call your local emergency number or a crisis line now and stay near someone you trust. If it is not immediate, please reach out to someone you trust or a mental-health professional today.",
    };
  }

  if (input.category !== null && MEDICAL_CATEGORIES.has(input.category)) {
    if (escalated) {
      return {
        activityDirective: "STOP",
        evaluationUrgency: "EMERGENCY",
        draft: vi
          ? "Triệu chứng đang nặng hơn. Dừng tập ngay và tìm hỗ trợ y tế khẩn cấp — gọi số cấp cứu nếu nặng hoặc xảy ra đột ngột."
          : "These symptoms are getting worse. Stop training now and get urgent medical care — call your local emergency number if it is severe or came on suddenly.",
      };
    }
    if (input.evidence === "unchanged") {
      return {
        activityDirective: "STOP",
        evaluationUrgency: "URGENT",
        draft: vi
          ? "Triệu chứng vẫn còn nên tiếp tục dừng tập và sớm đi khám để được đánh giá y tế. Không cố tập tiếp qua triệu chứng này."
          : "Since the symptoms are still there, stay stopped and get evaluated by a medical professional soon. Do not push through them.",
      };
    }
    // Nothing reported about the symptom (or only an unrelated message): the episode has NOT been reported resolved,
    // so the safety posture holds — and the reply asks for the one fact that could change it.
    return {
      activityDirective: "STOP",
      evaluationUrgency: "URGENT",
      draft: input.afterGap
        ? vi
          ? "Đã một thời gian kể từ lần báo triệu chứng trước và chưa có báo cáo nào là đã hết, nên vẫn giữ nguyên hướng: dừng tập và đi khám để được đánh giá y tế. Hiện tại triệu chứng đó còn không?"
          : "It has been a while since the symptoms were reported and nothing says they resolved, so the guidance stands: stop training and get evaluated medically. Is it still there right now?"
        : vi
          ? "Chưa có báo cáo nào là triệu chứng đã hết, nên vẫn giữ nguyên hướng: dừng tập và đi khám để được đánh giá y tế. Hiện tại triệu chứng đó còn không hay đã đỡ?"
          : "Nothing so far says the symptoms have resolved, so the guidance stands: stop training and get evaluated medically. Is it still there, or has it eased?",
    };
  }

  return {
    activityDirective: "MODIFY",
    evaluationUrgency: "ROUTINE",
    draft: vi
      ? "Vấn đề này vẫn chưa ổn nên giữ mức tải thận trọng: không thử mức tối đa và tránh động tác làm nặng thêm. Nếu không đỡ hoặc nặng hơn, hãy đi khám để được đánh giá. Cho mình biết có gì thay đổi để mình chỉnh lại kế hoạch."
      : "This is still unresolved, so keep the load conservative: no max attempts and nothing that aggravates it. If it does not settle or gets worse, get it checked by a professional. Tell me what changed and I'll adjust the plan.",
  };
}


/**
 * Store outage + a continuation cue ("vẫn còn", "still there") with NO episode recoverable from the recent
 * conversation. The cue cannot be grounded, and normal coaching must not be the fallback: keep the conservative
 * safety posture and ask which symptom is meant. Pronoun-free.
 */
export function buildUngroundedContinuationClarification(language: "en" | "vi"): SafetyContinuation {
  return {
    activityDirective: "STOP",
    evaluationUrgency: "URGENT",
    draft: language === "vi"
      ? "Mình không xem lại được phần trước nên chưa biết \"vẫn còn\" là triệu chứng nào. Nếu đó là đau ngực, chóng mặt, khó thở hoặc tê, hãy dừng tập và đi khám để được đánh giá y tế ngay. Cho mình biết triệu chứng cụ thể để tiếp tục cho đúng."
      : "I can't see the earlier part of this conversation, so I don't know which symptom is still there. If it is chest pain, dizziness, trouble breathing or numbness, stop training and get evaluated medically now. Tell me which symptom you mean and I will continue from there.",
  };
}
