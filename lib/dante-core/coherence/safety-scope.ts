/**
 * Safety scope — an active safety episode constrains TRAINING advice only.
 *
 * A red-flag symptom in a message used to end the whole turn: the safety copy went out, every sibling request was
 * dropped or "held". That is a correctness bug in both directions — an unrelated question (nutrition, a general fact,
 * a privacy boundary) was refused for no safety reason, and the sibling that IS training-related got no answer at all.
 *
 * Here the safety copy is one decided block among the turn's obligations, and each sibling request is sorted by what
 * the safety state can actually constrain:
 *   - TRAINING  → answered deterministically, constrained by the safety state (no load / intensity advice while a stop
 *                 rule is active); never handed to a provider that could clear the user to train.
 *   - UNRELATED → answered by the normal scoped provider call; the safety stop rule does not censor it (a claim about
 *                 symptoms or clearance inside it is still judged — see authority.ts).
 * A request that asks Dante to drop warnings / simply agree (a core-conflict clause) is rejected outright.
 *
 * Pure and deterministic: no I/O, no LLM. The route supplies the safety decision and the turn's obligations.
 */

import { interpretExpressionFeedback } from "@/lib/dante-core/coherence/expression-feedback";
import type { CoreConflictDecision } from "@/lib/dante-core/coherence/types";
import { foldText } from "@/lib/dante-core/coherence/understanding";
import type { HandledObligation, ObligationDisposition, TurnObligation } from "@/lib/dante-core/runtime-convergence/multi-intent";
import type { SafetyCategory } from "@/lib/dante-core/safety-layer";

/**
 * Categories a scoped turn may answer around: the medical STOP categories, whose reply is a hard block ("stop training,
 * get help") that says nothing about the user's other requests. Everything else keeps its established reply:
 *  - crisis categories (self-harm, eating disorder, dangerous substance, ambiguous safety): nothing else in that
 *    message is the priority, so the whole-turn safety reply stands;
 *  - bounded-coaching redirects (possible_injury, composed_training_risk): the safety copy IS the coaching answer to the
 *    training question, so there is no blanket deferral to remove and no request the copy leaves unanswered.
 */
const SCOPED_CATEGORIES: ReadonlySet<SafetyCategory> = new Set<SafetyCategory>([
  "chest_pain_cardiac",
  "fainting_dizziness",
  "neurological_symptoms",
  "severe_pain",
]);

export function isSafetyScopedCategory(category: SafetyCategory | null): boolean {
  return category !== null && SCOPED_CATEGORIES.has(category);
}

export type SafetyScope = "TRAINING" | "UNRELATED";

/** A request whose answer would advise on exercise, load, intensity or a session — the only thing a stop rule constrains. */
const TRAINING_REQUEST =
  /\b(?:bench|squat|deadlift|ohp|overhead|press|row|curl|pull ?ups?|push ?ups?|lift(?:ing)?|workout|work ?out|training|train|exercise|sets?|reps?|rpe|kg|kgs|lbs?|weights?|load|volume|progress(?:ion)?|warm ?up|cardio|running|sprint|hiit|gym|program|routine|deload|tap|luyen|buoi tap|bai tap|lich tap|tang ta|nghi giua)\b/;

export function classifyRequestScope(request: Pick<TurnObligation, "sourceSpan" | "payload">): SafetyScope {
  const text = foldText(`${request.sourceSpan?.text ?? ""} ${request.payload.normalized ?? ""}`);
  return TRAINING_REQUEST.test(text) ? "TRAINING" : "UNRELATED";
}

/** The request tries to change Dante's core behaviour (agree regardless, drop warnings) — decided by the existing prefilter. */
export function isCoreConflictRequest(
  request: Pick<TurnObligation, "sourceSpan">,
  decision: CoreConflictDecision | null,
): boolean {
  if (decision?.status === "NONE") return false;
  const text = request.sourceSpan?.text ?? "";
  return text.length > 0 && interpretExpressionFeedback(text).coreConflictCandidates.length > 0;
}

/* ---------------------------- per-request language ---------------------------- */

const LANGUAGE_WORDS = new Set([
  "tra", "loi", "cau", "bang", "tieng", "anh", "viet", "english", "vietnamese", "answer", "reply", "respond", "please",
  "the", "this", "that", "hay", "cho", "toi", "tao", "minh", "nhe", "with", "for", "from",
]);
const tokensOf = (text: string): Set<string> =>
  new Set(foldText(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !LANGUAGE_WORDS.has(w) && !/^\d+$/.test(w)));

/**
 * "Trả lời câu bench bằng tiếng Anh": a language instruction that names the request it is about applies to THAT
 * request only. An instruction that names nothing keeps the turn's language (the session language decision owns it).
 */
export function languageForRequest(
  request: Pick<TurnObligation, "sourceSpan" | "payload">,
  obligations: ReadonlyArray<TurnObligation>,
  turnLanguage: "en" | "vi",
): "en" | "vi" {
  const own = tokensOf(`${request.sourceSpan?.text ?? ""} ${request.payload.normalized ?? ""}`);
  for (const obligation of obligations) {
    if (obligation.intent !== "LANGUAGE_PREFERENCE") continue;
    const kind = obligation.payload.kind;
    if (kind !== "switch_en" && kind !== "switch_vi") continue;
    const named = [...tokensOf(obligation.sourceSpan?.text ?? "")].some((token) => own.has(token));
    if (named) return kind === "switch_en" ? "en" : "vi";
  }
  return turnLanguage;
}

/* ---------------------------- deterministic answers ---------------------------- */

const LIFTS: Array<[RegExp, string]> = [
  [/\bbench\b/, "bench"], [/\bsquat\b/, "squat"], [/\bdeadlift\b/, "deadlift"], [/\b(?:ohp|overhead press)\b/, "overhead press"],
  [/\brow\b/, "row"], [/\bcurl\b/, "curl"], [/\bpull ?ups?\b/, "pull-up"],
];

export function topicOf(request: Pick<TurnObligation, "sourceSpan" | "payload">): string | null {
  const text = foldText(`${request.sourceSpan?.text ?? ""} ${request.payload.normalized ?? ""}`);
  return LIFTS.find(([re]) => re.test(text))?.[1] ?? null;
}

/**
 * The training answer the safety state allows while a stop rule is active. It advises nothing about load or intensity
 * and never clears the user; the only forward step is "get checked, then ask again". `topic` names the lift when the
 * turn's training requests name exactly one.
 */
export function buildSafetyConstrainedAnswer(input: { topic: string | null; language: "en" | "vi" }): string {
  if (input.language === "vi") {
    const about = input.topic ? `Về ${input.topic}: ` : "Về các câu hỏi tập luyện của bạn: ";
    return `${about}khi triệu chứng bạn vừa nói còn đang diễn ra, mình sẽ không tư vấn tăng hay giữ mức tạ nào — cả bước nhỏ lẫn bước lớn. Hãy ngừng tập và được đánh giá y tế trước; khi đã được kiểm tra, hỏi lại mình để chọn mức tăng.`;
  }
  const about = input.topic ? `On ${input.topic}: ` : "On your training questions: ";
  return `${about}while the symptoms you just described are active, I won't advise any load — not the smaller step and not the bigger one. Stop training and get medical help first; once you've been checked, ask again and I'll help you pick the increment.`;
}

export function buildRejectedCoreConflictNotice(language: "en" | "vi"): string {
  return language === "vi"
    ? "Mình sẽ không chỉ đồng ý theo, và mình vẫn giữ các cảnh báo an toàn."
    : "I won't just agree with you, and I'm keeping the safety warnings.";
}

/* ---------------------------- the scoped turn ---------------------------- */

export type SafetyScopedTurn = {
  /** Open requests the safety state constrains: already answered deterministically. */
  constrained: string[];
  /** Open requests no safety rule touches: answered by the normal scoped provider call. */
  unrelated: TurnObligation[];
  /** The core-conflict request, if the user asked to drop warnings / simply agree. */
  rejectedCoreConflict: string[];
};

/** The obligation that carries the fresh safety decision into the ledger (deterministic: the safety layer's own copy). */
export const FRESH_SAFETY_OBLIGATION_ID = "obl_safety_fresh";

export function freshSafetyObligation(): TurnObligation {
  return {
    id: FRESH_SAFETY_OBLIGATION_ID,
    intent: "TEMPORAL_SAFETY",
    payload: { reason: "active_red_flag_in_turn" },
    priority: 10,
  };
}

/**
 * Sorts the open requests of a safety turn and pre-answers the ones the safety state owns. Returns the handled list
 * with those entries already ANSWERED / REFUSED (deterministic, no provider origin) and the rest still DEFERRED and
 * marked UNRELATED so the authority guard applies no stop-rule censorship to their provider prose.
 *
 * Every training request gets its own ANSWERED disposition, but the constrained answer is stated ONCE (on the first
 * one): the same sentence repeated per request would only be noise.
 */
export function scopeOpenRequests(input: {
  handled: HandledObligation[];
  obligations: ReadonlyArray<TurnObligation>;
  language: "en" | "vi";
  coreConflict: CoreConflictDecision | null;
}): { handled: HandledObligation[]; scoped: SafetyScopedTurn } {
  const scoped: SafetyScopedTurn = { constrained: [], unrelated: [], rejectedCoreConflict: [] };
  const training = input.handled.filter(
    (h) => h.intent === "OPEN_REQUEST" && h.disposition === "DEFERRED"
      && !isCoreConflictRequest(h, input.coreConflict) && classifyRequestScope(h) === "TRAINING",
  );
  const topics = new Set(training.map((h) => topicOf(h)));
  const sharedTopic = topics.size === 1 ? [...topics][0] : null;
  const handled = input.handled.map((h): HandledObligation => {
    if (h.intent !== "OPEN_REQUEST" || h.disposition !== "DEFERRED") return h;
    const language = languageForRequest(h, input.obligations, input.language);
    if (isCoreConflictRequest(h, input.coreConflict)) {
      scoped.rejectedCoreConflict.push(h.id);
      return { ...h, disposition: "REFUSED" as ObligationDisposition, text: buildRejectedCoreConflictNotice(language) };
    }
    if (classifyRequestScope(h) === "TRAINING") {
      const first = scoped.constrained.length === 0;
      scoped.constrained.push(h.id);
      return {
        ...h,
        disposition: "ANSWERED" as ObligationDisposition,
        text: first ? buildSafetyConstrainedAnswer({ topic: sharedTopic, language }) : "",
      };
    }
    scoped.unrelated.push(h);
    return { ...h, safetyScope: "UNRELATED" };
  });
  return { handled, scoped };
}
