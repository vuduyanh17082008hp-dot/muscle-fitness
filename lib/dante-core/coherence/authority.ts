/**
 * Phase 2.5a (5R2) — P-10 AUTHORITY BEFORE SURFACE.
 *
 * A ResponseBlock is not authority merely because it is a structure: for provider prose, `text != semantic
 * authority`. This module is the ONE authority boundary between "what a block says" and "what may reach the user":
 *
 *   authoritative state / decisions ─┐
 *   provider prose (UNVERIFIED) ─────┴─► authorizeBlocks ─► blocks that are AUTHORITATIVE | VERIFIED_DERIVED
 *                                                            (renderable) or DEGRADED (neutral acknowledgement)
 *
 * Both realizations — the normal path and the Persona-Gate fallback — render through `blockSurfaceText`, so there is a
 * single authority contract and no second safety model.
 *
 * Provider prose is judged UNIT by unit (clause). A unit that states a claim in a GOVERNED domain (which side hurts,
 * when it started, how sure we are, whether training may continue) is admitted only if the SAME claim is held by
 * authoritative state; a governed claim the state does not hold is refused (fail-closed), not patched. A unit with no
 * governed claim is admitted only when an existing verification path (the route's provider verifier) passed and no
 * Phase 1 claim family objects. Nothing here rewrites, substitutes or deletes words inside a claim: a unit is either
 * surfaced verbatim or replaced by a neutral acknowledgement, and the withheld claim is not retained.
 *
 * No model is called. This is not a second reasoning engine — it compares claims against state that already exists.
 */

import type { AuthoritativeResponseState, CanonicalClaim } from "@/lib/dante-core/runtime-convergence/authoritative-state";
import { projectClaims } from "@/lib/dante-core/runtime-convergence/claim-projection";
import type { HandledObligation } from "@/lib/dante-core/runtime-convergence/multi-intent";
import { persistedClaimsFromState } from "@/lib/dante-core/coherence/authoritative-claims";
import { LATERALITY_TOPIC } from "@/lib/dante-core/coherence/corrections";
import type {
  DegradeReason,
  ResponseBlock,
  SafetyPhase,
  VerificationStatus,
  VersionedState,
} from "@/lib/dante-core/coherence/types";

type Language = "en" | "vi";
type Side = "LEFT" | "RIGHT";

/* ------------------------------------------------------------------ */
/* Block constructors — the only places a block's source is declared    */
/* ------------------------------------------------------------------ */

const NO_STATE_BACKING = "composed";

/** A line composed from settled state (correction ack, laterality reminder, safety note, degradation notice). */
export function semanticBlock(obligationId: string, text: string): ResponseBlock {
  return {
    obligationId,
    disposition: "COMPOSED",
    text,
    order: 0,
    source: "SEMANTIC_STATE",
    authority: "AUTHORITATIVE",
    verification: "NOT_REQUIRED",
    renderStatus: "NORMAL",
    semanticRefs: [NO_STATE_BACKING],
  };
}

/** Text produced by a deterministic decision (a handled obligation's own reply, a deterministic draft). */
export function decisionBlock(obligationId: string, disposition: ResponseBlock["disposition"], text: string): ResponseBlock {
  return {
    obligationId,
    disposition,
    text,
    order: 0,
    source: "DETERMINISTIC_DECISION",
    authority: "AUTHORITATIVE",
    verification: "NOT_REQUIRED",
    renderStatus: "NORMAL",
    semanticRefs: [obligationId],
  };
}

/**
 * Provider prose. It is born UNVERIFIED: nothing about being a block, being persona-valid or passing the Persona Gate
 * changes that. Only `authorizeBlocks` can promote it, and only by proof.
 */
export function providerBlock(obligationId: string, disposition: ResponseBlock["disposition"], text: string): ResponseBlock {
  return {
    obligationId,
    disposition,
    text,
    order: 0,
    source: "PROVIDER_OUTPUT",
    authority: "UNVERIFIED",
    verification: "UNAVAILABLE",
    renderStatus: "NORMAL",
  };
}

/* ------------------------------------------------------------------ */
/* Authority context — derived from state that already exists           */
/* ------------------------------------------------------------------ */

export type AuthorityContext = {
  laterality: { present: ReadonlySet<Side>; absent: ReadonlySet<Side>; uncertain: boolean };
  /** Symptom timing the state holds: today/ongoing (CURRENT) and/or earlier (HISTORICAL|RECENT); `known` = any symptom claim at all. */
  temporal: { current: boolean; past: boolean; known: boolean };
  /** UNCERTAIN: state holds a provenance/recall limit, so nothing may be said with more strength than the user did. */
  ceiling: "UNCERTAIN" | "OPEN";
  /** Whether training must stop (ACTIVE), must stop if the symptom persists (CONDITIONAL), or is not constrained. */
  safety: { stopRule: "ACTIVE" | "CONDITIONAL" | "NONE" };
  /** The Phase 1 authoritative state, for its claim-family detectors. Null → those detectors are skipped. */
  authoritative: AuthoritativeResponseState | null;
};

const MEDICAL_STOP_CATEGORIES = new Set(["chest_pain_cardiac", "fainting_dizziness", "neurological_symptoms", "severe_pain", "self_harm_crisis"]);
const STOP_CONCEPTS = new Set(["CHEST_PAIN", "DIZZINESS", "FAINTING", "SHORTNESS_OF_BREATH", "NUMBNESS"]);
const TRUSTED_PROVENANCE = new Set(["EXPLICIT_CURRENT_REPORT", "EXPLICIT_HISTORICAL_REPORT", "VERIFIED_TOOL_DATA"]);

export function buildAuthorityContext(input: {
  authoritative?: AuthoritativeResponseState | null;
  state: VersionedState;
  safetyPhase: SafetyPhase;
  safetyCategory?: string | null;
  /** A red-flag symptom was mentioned (not necessarily present now). */
  safetyMentioned?: boolean;
}): AuthorityContext {
  const base = input.authoritative ?? null;
  const persisted = persistedClaimsFromState(input.state);
  const current: CanonicalClaim[] = [...(base?.currentStateClaims ?? [])];
  const historical: CanonicalClaim[] = [...(base?.historicalClaims ?? [])];
  for (const claim of persisted) {
    if (!historical.some((h) => h.source === "PERSISTED_CORRECTION" && h.laterality === claim.laterality)) historical.push(claim);
  }
  const all = [...current, ...historical];

  const present = new Set<Side>();
  const absent = new Set<Side>();
  for (const claim of all) {
    if (claim.laterality !== "LEFT" && claim.laterality !== "RIGHT") continue;
    if (!TRUSTED_PROVENANCE.has(claim.provenance) && claim.source !== "PERSISTED_CORRECTION") continue;
    if (claim.polarity === "PRESENT") present.add(claim.laterality);
    else if (claim.polarity === "ABSENT") absent.add(claim.laterality);
  }
  // A side the user corrected AWAY from is not the side of that episode (history kept, authority to the correction).
  for (const slot of input.state.corrections) {
    if (slot.value.topic !== LATERALITY_TOPIC || slot.status !== "SUPERSEDED") continue;
    const side = slot.value.statement;
    if ((side === "LEFT" || side === "RIGHT") && !present.has(side)) absent.add(side);
  }
  for (const side of present) absent.delete(side);

  const constraints = base?.provenanceConstraints ?? [];
  const lateralityUncertain = present.size === 0 && (
    constraints.some((c) => !c.mayAssertLaterality)
    || all.some((c) => c.laterality === "UNCERTAIN")
  );
  const ceilingUncertain = constraints.some((c) => !c.mayAssertLaterality || !c.mayAssertExactCount)
    || all.some((c) => c.provenance === "USER_RECALL_UNCERTAIN" || c.laterality === "UNCERTAIN")
    || (base?.experimentState?.conclusion === "INCONCLUSIVE" || base?.experimentState?.conclusion === "CONFOUNDED")
    || (base?.causalClaims ?? []).some((c) => c.target !== null && c.conclusion === "NOT_ESTABLISHED");

  const activePhase = input.safetyPhase === "ENTER" || input.safetyPhase === "PERSIST" || input.safetyPhase === "ESCALATE";
  const stopSymptomNow = current.some((c) => STOP_CONCEPTS.has(c.concept) && c.polarity === "PRESENT");
  const stopSymptomAny = all.some((c) => STOP_CONCEPTS.has(c.concept));
  const category = input.safetyCategory ?? null;
  let stopRule: AuthorityContext["safety"]["stopRule"] = "NONE";
  if (
    (activePhase && (category === null || MEDICAL_STOP_CATEGORIES.has(category)))
    || stopSymptomNow
    || base?.safetyDecision?.action === "ESCALATE"
  ) {
    stopRule = "ACTIVE";
  } else if (
    input.safetyPhase === "DOWNGRADE"
    || input.safetyPhase === "EXIT"
    || input.safetyMentioned === true
    || stopSymptomAny
    || base?.safetyDecision?.action === "REDIRECT"
    || (category !== null && MEDICAL_STOP_CATEGORIES.has(category))
  ) {
    stopRule = "CONDITIONAL";
  }

  return {
    laterality: { present, absent, uncertain: lateralityUncertain },
    temporal: {
      current: current.some((c) => c.polarity === "PRESENT"),
      past: historical.some((c) => c.polarity !== "ABSENT"),
      known: all.length > 0,
    },
    ceiling: ceilingUncertain ? "UNCERTAIN" : "OPEN",
    safety: { stopRule },
    authoritative: base ?? emptyAuthoritative(historical),
  };
}

function emptyAuthoritative(historical: CanonicalClaim[]): AuthoritativeResponseState {
  return {
    currentStateClaims: [],
    historicalClaims: historical,
    provenanceConstraints: [],
    causalClaims: [],
    actionState: null,
    experimentState: null,
    safetyDecision: null,
  };
}

/* ------------------------------------------------------------------ */
/* Provider claims — a small recognizer for the GOVERNED domains        */
/* ------------------------------------------------------------------ */

/**
 * The domains are the ones a user's own body/report and the safety layer own: symptom side, symptom timing, strength
 * of certainty, and clearance to keep training. The recognizer only says "this clause states a claim in a governed
 * domain, and which"; whether it may be said is decided by comparison with state, never by a phrase list of wrong
 * answers.
 */
type ProviderClaim =
  | { kind: "LATERALITY"; side: Side; polarity: "PRESENT" | "ABSENT"; hedged: boolean }
  | { kind: "TEMPORAL"; anchor: "TODAY" | "PAST"; hedged: boolean }
  | { kind: "CERTAINTY" }
  | { kind: "CLEARANCE"; symptomConditional: boolean }
  /** Says to stop / seek care — consistent with any stop rule, never a conflict. */
  | { kind: "STOP" };

const L = "(?<![\\p{L}])";
const R = "(?![\\p{L}])";
const rx = (source: string, flags = "giu"): RegExp => new RegExp(source, flags);

const SYMPTOM = rx(`${L}(?:đau|nhức|buốt|chấn thương|viêm|kích ứng|khó chịu|căng cơ|pain|painful|hurts?|hurting|sore|soreness|ache|aching|injur\\w*|irritat\\w*|strain\\w*|tweak\\w*|discomfort)${R}`);
const NEGATED_SYMPTOM = rx(`${L}(?:không|chẳng|chưa|hết|no longer|not|isn'?t|aren'?t|doesn'?t|don'?t|without|free of|pain-free)${R}\\s+(?:\\p{L}+\\s+){0,2}(?:đau|nhức|buốt|chấn thương|viêm|kích ứng|khó chịu|pain|painful|hurts?|sore|ache|injur\\w*|irritat\\w*|discomfort)${R}`);
const NEGATION_BEFORE_SIDE = rx(`(?:không phải|chứ không phải|chứ không|không hề|not(?: the)?|rather than|instead of|is not|isn'?t)\\s*(?:là\\s*)?$`, "iu");
const HEDGE = rx(`${L}(?:có thể|có lẽ|hình như|chưa chắc|không chắc|dường như|maybe|might|possibly|perhaps|probably|not sure|seems?|appears?)${R}`);

const SIDE_VI = rx(`${L}(?:vai|bên|phía|tay|chân|gối|khuỷu(?: tay)?|hông|cổ tay|đùi|cánh tay|bắp chân)\\s+(trái|phải)${R}`);
const SIDE_EN = rx(`${L}(left|right)\\s+(?:shoulder|arm|knee|elbow|hip|leg|wrist|hand|foot|side|one)${R}`);
const SIDE_EN_POST = rx(`${L}(?:shoulder|arm|knee|elbow|hip|leg|wrist)\\s+on\\s+the\\s+(left|right)${R}`);

const TODAY = rx(`${L}(?:hôm nay|sáng nay|tối nay|chiều nay|vừa mới|lúc nãy|today|this morning|this evening|tonight|just now)${R}`);
const PAST = rx(`${L}(?:hôm qua|tối qua|hôm trước|tuần trước|tháng trước|last night|yesterday|last week|last month|the day before)${R}`);
const NEGATION_BEFORE_ANCHOR = rx(`(?:không phải|chứ không phải|chứ không|not)\\s*$`, "iu");
const ONSET = rx(`${L}(?:bắt đầu|khởi phát|started|began|onset)${R}`);

const CERTAINTY = rx(`${L}(?:chắc chắn|tuyệt đối|hoàn toàn chắc|đảm bảo|không nghi ngờ gì|rõ ràng là|definitely|certainly|absolutely|guarantee\\w*|no doubt|without (?:a )?doubt|for sure|undoubtedly)${R}|100\\s*(?:%|percent)`);
const NEGATION_BEFORE_CERTAINTY = rx(`(?:không|chưa|chẳng|not|no)\\s*$`, "iu");
const CERTAINTY_SUBJECT = rx(`${L}(?:đau|nhức|chấn thương|viêm|kích ứng|nguyên nhân|vai|bên|hôm|pain|hurt|injur\\w*|irritat\\w*|cause|because|shoulder|yesterday|today)${R}`);

const CLEARANCE = rx([
  `${L}(?:cứ|vẫn)\\s+(?:có thể\\s+)?(?:tập|luyện|nâng|chơi)${R}`,
  `${L}tập\\s+(?:tiếp|nhẹ)${R}`,
  `${L}(?:tập|luyện tập|nâng)[^.!?\\n]{0,24}(?:là\\s+)?(?:được|ổn|ok|okay|không sao)${R}`,
  `${L}không sao${R}`,
  `${L}không có gì nghiêm trọng${R}`,
  `${L}an toàn để (?:tập|nâng|luyện)`,
  `${L}keep\\s+(?:training|lifting|going|working out)${R}`,
  `${L}(?:can|could)\\s+(?:still\\s+)?(?:train|lift|work ?out|exercise)${R}`,
  `${L}(?:go ahead|carry on|continue)\\s+(?:with\\s+)?(?:training|lifting|the (?:session|workout))?${R}`,
  `${L}(?:light|easy)\\s+(?:training|work|lifting|sessions?)\\s+(?:is|are)\\s+(?:fine|ok|okay)${R}`,
  `${L}(?:it'?s|is)\\s+(?:fine|ok|okay|safe)\\s+to\\s+(?:train|lift|work ?out|exercise)${R}`,
  `${L}(?:safe|fine|ok|okay)\\s+to\\s+(?:train|lift|work ?out|exercise)${R}`,
  `${L}nothing\\s+(?:serious|to worry)`,
].join("|"));
/** Words that turn a permission into its opposite ("đừng cứ tập tiếp", "should not keep training"). */
const PERMISSION_NEGATED = rx(`${L}(?:đừng|không nên|không được|chưa nên|không thể|do not|don'?t|shouldn'?t|should not|never|avoid|hold off|thay vì)${R}`);
const STOP_DIRECTIVE = rx([
  `${L}(?:dừng|nghỉ|ngừng)\\s+(?:tập|lại|luôn|ngay)${R}`,
  `${L}(?:đi khám|gặp bác sĩ|cấp cứu|khám bác sĩ)`,
  `${L}stop\\s+(?:training|lifting|exercising|the (?:set|session|workout))${R}`,
  `${L}(?:see|call) (?:a |an )?(?:doctor|professional|ambulance)`,
  `${L}seek\\s+(?:medical|urgent)`,
  `${L}emergency${R}`,
].join("|"));
/** "không cần dừng", "no need to stop": a stop word under negation is a clearance, not a stop. */
const STOP_NEGATED = rx(`(?:không cần|chưa cần|không nhất thiết phải|không phải|no need to|don'?t need to|do not need to|don'?t have to|needn'?t)\\s*$`, "iu");
const SYMPTOM_CONDITION =rx(`${L}(?:đau ngực|chest|chóng mặt|dizz\\w*|khó thở|breath\\w*|ngất|faint\\w*|tê|numb\\w*|tim|heart|vẫn còn|còn đau|persist\\w*|still)${R}`);

function sidesIn(text: string): Array<{ side: Side; index: number; end: number }> {
  const found: Array<{ side: Side; index: number; end: number }> = [];
  for (const m of text.matchAll(SIDE_VI)) {
    found.push({ side: m[1].toLowerCase() === "trái" ? "LEFT" : "RIGHT", index: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  for (const re of [SIDE_EN, SIDE_EN_POST]) {
    for (const m of text.matchAll(re)) {
      found.push({ side: m[1].toLowerCase() === "left" ? "LEFT" : "RIGHT", index: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

const has = (re: RegExp, text: string): boolean => new RegExp(re.source, re.flags.replace("g", "")).test(text);

/**
 * A conditional ("nếu vai phải đau thì…") or a question ("hôm nay vai bạn có đau không?") does not ASSERT a fact about the
 * user, so it is not a claim about their state (side / timing). Clearance and certainty are judged regardless: a
 * conditional clearance ("nếu vẫn đau ngực thì cứ tập nhẹ") is exactly the unsafe relation F8 guards.
 */
const CONDITIONAL = rx(`${L}(?:nếu|nếu như|giả sử|trường hợp|if|in case|suppose|supposing)${R}`);
const isQuestion = (sentence: string): boolean => /\?\s*$/.test(sentence.trim());

function extractClaims(unit: string, sentence: string): ProviderClaim[] {
  const claims: ProviderClaim[] = [];
  const hedged = has(HEDGE, unit);
  const hasSymptom = has(SYMPTOM, unit);
  const assertsState = !has(CONDITIONAL, unit) && !isQuestion(sentence);

  const sides = assertsState ? sidesIn(unit) : [];
  for (const [i, mention] of sides.entries()) {
    const before = unit.slice(Math.max(0, mention.index - 30), mention.index);
    const after = unit.slice(mention.end, sides[i + 1]?.index ?? unit.length);
    if (NEGATION_BEFORE_SIDE.test(before)) {
      claims.push({ kind: "LATERALITY", side: mention.side, polarity: "ABSENT", hedged });
    } else if (has(NEGATED_SYMPTOM, after) || (has(NEGATED_SYMPTOM, unit) && !has(SYMPTOM, after))) {
      claims.push({ kind: "LATERALITY", side: mention.side, polarity: "ABSENT", hedged });
    } else if (hasSymptom) {
      claims.push({ kind: "LATERALITY", side: mention.side, polarity: "PRESENT", hedged });
    }
  }

  if (assertsState && (hasSymptom || has(ONSET, unit)) && !has(NEGATED_SYMPTOM, unit)) {
    const anchored = (re: RegExp): boolean => {
      for (const m of unit.matchAll(re)) {
        const before = unit.slice(Math.max(0, (m.index ?? 0) - 20), m.index ?? 0);
        if (!NEGATION_BEFORE_ANCHOR.test(before)) return true;
      }
      return false;
    };
    if (anchored(TODAY)) claims.push({ kind: "TEMPORAL", anchor: "TODAY", hedged });
    if (anchored(PAST)) claims.push({ kind: "TEMPORAL", anchor: "PAST", hedged });
  }

  if (has(CERTAINTY_SUBJECT, sentence)) {
    for (const m of unit.matchAll(CERTAINTY)) {
      const before = unit.slice(Math.max(0, (m.index ?? 0) - 10), m.index ?? 0);
      if (!NEGATION_BEFORE_CERTAINTY.test(before)) {
        claims.push({ kind: "CERTAINTY" });
        break;
      }
    }
  }

  const clearance = new RegExp(CLEARANCE.source, CLEARANCE.flags).exec(unit);
  if (clearance) {
    const before = unit.slice(0, clearance.index);
    if (!PERMISSION_NEGATED.test(before.slice(-40)) && !PERMISSION_NEGATED.test(clearance[0])) {
      claims.push({ kind: "CLEARANCE", symptomConditional: has(SYMPTOM_CONDITION, sentence) });
    }
  }
  const stop = new RegExp(STOP_DIRECTIVE.source, STOP_DIRECTIVE.flags).exec(unit);
  if (stop) {
    if (STOP_NEGATED.test(unit.slice(Math.max(0, stop.index - 24), stop.index))) {
      claims.push({ kind: "CLEARANCE", symptomConditional: has(SYMPTOM_CONDITION, sentence) });
    } else {
      claims.push({ kind: "STOP" });
    }
  }
  return claims;
}

/* ------------------------------------------------------------------ */
/* Judgement: claim vs state                                            */
/* ------------------------------------------------------------------ */

type Verdict = { ok: true; ref: string } | { ok: false; reason: DegradeReason };

function judgeClaim(claim: ProviderClaim, ctx: AuthorityContext): Verdict {
  switch (claim.kind) {
    case "LATERALITY": {
      const { present, absent, uncertain } = ctx.laterality;
      if (claim.polarity === "PRESENT") {
        if (present.has(claim.side)) return { ok: true, ref: `authority:LATERALITY:${claim.side}` };
        if (absent.has(claim.side) || present.size > 0) return { ok: false, reason: "CONTRADICTS_STATE" };
        if (uncertain) return claim.hedged ? { ok: true, ref: "authority:LATERALITY:hedged" } : { ok: false, reason: "PROVENANCE_CONFLICT" };
        return claim.hedged ? { ok: true, ref: "authority:LATERALITY:hedged" } : { ok: false, reason: "MISSING_AUTHORITY" };
      }
      if (absent.has(claim.side)) return { ok: true, ref: `authority:LATERALITY:not-${claim.side}` };
      if (present.has(claim.side)) return { ok: false, reason: "CONTRADICTS_STATE" };
      return claim.hedged ? { ok: true, ref: "authority:LATERALITY:hedged" } : { ok: false, reason: "MISSING_AUTHORITY" };
    }
    case "TEMPORAL": {
      const { current, past, known } = ctx.temporal;
      if (!known) return claim.hedged ? { ok: true, ref: "authority:TEMPORAL:hedged" } : { ok: false, reason: "MISSING_AUTHORITY" };
      const held = claim.anchor === "TODAY" ? current : past;
      return held ? { ok: true, ref: `authority:TEMPORAL:${claim.anchor}` } : { ok: false, reason: "CONTRADICTS_STATE" };
    }
    case "CERTAINTY":
      return ctx.ceiling === "UNCERTAIN" ? { ok: false, reason: "PROVENANCE_CONFLICT" } : { ok: true, ref: "authority:CERTAINTY" };
    case "STOP":
      return { ok: true, ref: "authority:STOP" };
    case "CLEARANCE": {
      const { stopRule } = ctx.safety;
      if (stopRule === "ACTIVE" || (stopRule === "CONDITIONAL" && claim.symptomConditional)) {
        return { ok: false, reason: "SAFETY_CONFLICT" };
      }
      return { ok: true, ref: "authority:CLEARANCE" };
    }
  }
}

const REASON_PRIORITY: DegradeReason[] = ["SAFETY_CONFLICT", "CONTRADICTS_STATE", "PROVENANCE_CONFLICT", "FAILED_VERIFICATION", "MISSING_AUTHORITY"];
const worst = (reasons: DegradeReason[]): DegradeReason =>
  REASON_PRIORITY.find((r) => reasons.includes(r)) ?? "MISSING_AUTHORITY";

type UnitVerdict = { ok: true; refs: string[] } | { ok: false; reason: DegradeReason };

/** Phase 1 claim families that this guard reuses as detectors (LATERALITY is judged above, against the same state). */
const PHASE1_REASON: Record<string, DegradeReason> = {
  PROVENANCE_STRENGTH: "PROVENANCE_CONFLICT",
  EXACT_COUNT: "PROVENANCE_CONFLICT",
  CURRENT_STATE: "CONTRADICTS_STATE",
  CAUSAL_TARGET: "CONTRADICTS_STATE",
  CAUSAL_CONCLUSION: "CONTRADICTS_STATE",
  EXPERIMENT_CONCLUSION: "CONTRADICTS_STATE",
};

function judgeUnit(
  unit: string,
  sentence: string,
  ctx: AuthorityContext,
  verification: VerificationStatus,
  language: Language,
  /** false = the block answers a request no safety rule constrains (nutrition, a general fact): recognized claims are still judged. */
  stopRuleCensors = true,
): UnitVerdict {
  const failures: DegradeReason[] = [];
  const refs: string[] = [];
  const claims = extractClaims(unit, sentence);
  for (const claim of claims) {
    const verdict = judgeClaim(claim, ctx);
    if (verdict.ok) refs.push(verdict.ref);
    else failures.push(verdict.reason);
  }
  if (ctx.authoritative) {
    const projected = projectClaims({ draft: unit, authoritative: ctx.authoritative, language });
    for (const violation of projected.violations) {
      const reason = PHASE1_REASON[violation.family];
      if (reason) failures.push(reason);
    }
  }
  if (failures.length > 0) return { ok: false, reason: worst(failures) };
  if (claims.length > 0) return { ok: true, refs };
  // While training must STOP, provider prose that states no recognized claim cannot be vouched for by a verifier at all:
  // the recognizer's vocabulary is finite, and an unrecognized paraphrase of a clearance ("tiếp tục buổi tập bình thường",
  // "you're fine to continue") must not slip through. Structural, not a phrase list — only a question (which clears
  // nothing) or a recognized consistent claim (stop / seek care) is admitted on an ACTIVE stop rule.
  if (stopRuleCensors && ctx.safety.stopRule === "ACTIVE" && !isQuestion(sentence)) return { ok: false, reason: "SAFETY_CONFLICT" };
  // No governed claim: only an existing verification path can vouch for general prose.
  if (verification === "PASSED") return { ok: true, refs: ["verifier:pass"] };
  return { ok: false, reason: verification === "FAILED" ? "FAILED_VERIFICATION" : "MISSING_AUTHORITY" };
}

/* ------------------------------------------------------------------ */
/* Units                                                                */
/* ------------------------------------------------------------------ */

type Unit = { start: number; end: number; sentence: string };

const SENTENCE = /[^\n]+?(?:[.!?…]+(?=\s|$)|$)/gu;
const CLAUSE_BREAK = /\s*[,;:—–]\s+|\s+-\s+|\s+(?:và|nhưng|còn|mà|and|but|while|whereas|tuy nhiên|however)\s+/giu;

function splitUnits(text: string): Unit[] {
  const units: Unit[] = [];
  for (const sentenceMatch of text.matchAll(SENTENCE)) {
    const sentence = sentenceMatch[0];
    if (!sentence.trim()) continue;
    const base = sentenceMatch.index ?? 0;
    let cursor = 0;
    const push = (from: number, to: number): void => {
      if (sentence.slice(from, to).trim()) units.push({ start: base + from, end: base + to, sentence });
    };
    for (const brk of sentence.matchAll(CLAUSE_BREAK)) {
      const at = brk.index ?? 0;
      push(cursor, at);
      cursor = at + brk[0].length;
    }
    push(cursor, sentence.length);
  }
  return units;
}

/* ------------------------------------------------------------------ */
/* Acknowledgements (user-facing; no internal jargon)                   */
/* ------------------------------------------------------------------ */

export function degradedAck(reason: DegradeReason | undefined, language: Language, stopRule?: "ACTIVE" | "CONDITIONAL" | "NONE"): string {
  const vi = language === "vi";
  if (reason === "SAFETY_CONFLICT") {
    if (stopRule === "ACTIVE") return vi ? "Phần này mình chưa xác nhận được — hướng an toàn hiện tại vẫn là dừng tập." : "I can't confirm that part — the current safety guidance is still to stop training.";
    return vi ? "Phần này mình chưa xác nhận được — nếu triệu chứng đó còn, hướng an toàn vẫn là dừng tập." : "I can't confirm that part — if that symptom is still there, the safety guidance is still to stop training.";
  }
  return vi ? "Phần này mình chưa có đủ dữ kiện chắc chắn để chốt." : "I don't have enough solid information to settle this part.";
}

export function aggregateDegradedNotice(count: number, language: Language): string {
  return language === "vi"
    ? `Có ${count} phần mình chưa thể trả chắc chắn từ dữ liệu hiện tại.`
    : `There are ${count} parts I can't answer with confidence from the current data.`;
}

const STOP_RULE_REF = "stop:";

/**
 * THE surface contract. Every realization path — normal join, Persona-Gate fallback, degraded fallback — renders a
 * block through this one function. A block surfaces its own text only with authority the metadata proves; provider
 * prose can never be AUTHORITATIVE; a DEGRADED (or unguarded, or forged) block surfaces a neutral acknowledgement and
 * never its `text`.
 */
export function blockSurfaceText(block: ResponseBlock, language: Language): string {
  const deterministic = block.source !== "PROVIDER_OUTPUT";
  const surfaceable = block.renderStatus === "NORMAL" && (deterministic
    ? block.authority === "AUTHORITATIVE" && (block.verification === "NOT_REQUIRED" || block.verification === "PASSED")
    : block.authority === "VERIFIED_DERIVED" && block.verification === "PASSED");
  if (surfaceable) return block.text;
  const stopRef = block.semanticRefs?.find((ref) => ref.startsWith(STOP_RULE_REF))?.slice(STOP_RULE_REF.length);
  return degradedAck(block.degradeReason ?? "MISSING_AUTHORITY", language, stopRef === "ACTIVE" || stopRef === "CONDITIONAL" ? stopRef : undefined);
}

/* ------------------------------------------------------------------ */
/* The guard                                                            */
/* ------------------------------------------------------------------ */

const EDGE_JUNK = /^[\s,;:—–-]+|[\s,;:—–-]+$/g;
const LEADING_CONJUNCTION = /^(?:và|nhưng|còn|mà|and|but|while|whereas)\s+/iu;

/** Boundary trimming of a kept run (separators the clause split left at its edge) — never touches words inside it. */
function tidyRun(text: string): string {
  const trimmed = text.replace(EDGE_JUNK, "").replace(LEADING_CONJUNCTION, "").trim();
  return trimmed && !/[.!?…]$/.test(trimmed) ? `${trimmed}.` : trimmed;
}

function degradedBlock(base: ResponseBlock, reason: DegradeReason, stopRule: AuthorityContext["safety"]["stopRule"]): ResponseBlock {
  return {
    obligationId: base.obligationId,
    disposition: base.disposition,
    text: "",
    order: 0,
    source: "PROVIDER_OUTPUT",
    authority: "UNVERIFIED",
    verification: reason === "MISSING_AUTHORITY" ? "UNAVAILABLE" : "FAILED",
    renderStatus: "DEGRADED",
    degradeReason: reason,
    semanticRefs: stopRule === "NONE" ? ["degraded-unit"] : ["degraded-unit", `${STOP_RULE_REF}${stopRule}`],
  };
}

function authorizeProviderBlock(
  block: ResponseBlock,
  ctx: AuthorityContext,
  verification: VerificationStatus,
  language: Language,
  stopRuleCensors = true,
): ResponseBlock[] {
  const text = block.text;
  const units = splitUnits(text);
  if (units.length === 0) return [];
  const verdicts = units.map((unit) => judgeUnit(text.slice(unit.start, unit.end), unit.sentence, ctx, verification, language, stopRuleCensors));
  const refsOf = (list: UnitVerdict[]): string[] => [...new Set(list.flatMap((v) => (v.ok ? v.refs : [])))];

  if (verdicts.every((v) => v.ok)) {
    return [{
      ...block,
      authority: "VERIFIED_DERIVED",
      verification: "PASSED",
      renderStatus: "NORMAL",
      semanticRefs: refsOf(verdicts),
    }];
  }

  // Mixed: keep every admitted run verbatim (original punctuation, order), replace each refused run by ONE local
  // acknowledgement. Nothing inside an admitted run is edited and no refused claim is retained.
  const out: ResponseBlock[] = [];
  let index = 0;
  while (index < units.length) {
    const ok = verdicts[index].ok;
    let last = index;
    while (last + 1 < units.length && verdicts[last + 1].ok === ok) last += 1;
    if (ok) {
      const run = tidyRun(text.slice(units[index].start, units[last].end));
      if (run) {
        out.push({
          ...block,
          text: run,
          authority: "VERIFIED_DERIVED",
          verification: "PASSED",
          renderStatus: "NORMAL",
          semanticRefs: refsOf(verdicts.slice(index, last + 1)),
        });
      }
    } else {
      const reasons = verdicts.slice(index, last + 1).flatMap((v) => (v.ok ? [] : [v.reason]));
      out.push(degradedBlock(block, worst(reasons), ctx.safety.stopRule));
    }
    index = last + 1;
  }
  return out;
}

export type AuthorizeInput = {
  blocks: readonly ResponseBlock[];
  ctx: AuthorityContext;
  handled: readonly Pick<HandledObligation, "id" | "disposition" | "origin" | "safetyScope">[];
  /** Result of an existing verification path (the route's provider verifier) for provider prose. Absent → UNAVAILABLE. */
  providerVerification?: VerificationStatus;
  language: Language;
};

/**
 * Decides the authority and render status of every block. Source is re-derived here: a block cannot claim to be
 * deterministic if the obligation it carries came from a provider, and a `composed:*`/obligation handle must actually
 * exist. Provider blocks are promoted only by `judgeUnit`. Returns blocks in original order, renumbered.
 */
export function authorizeBlocks(input: AuthorizeInput): ResponseBlock[] {
  const verification: VerificationStatus = input.providerVerification === "PASSED" || input.providerVerification === "FAILED"
    ? input.providerVerification
    : "UNAVAILABLE";
  const handledById = new Map(input.handled.map((h) => [h.id, h]));
  const out: ResponseBlock[] = [];
  for (const block of input.blocks) {
    const handled = handledById.get(block.obligationId);
    const derivedProvider = block.source === "PROVIDER_OUTPUT" || handled?.origin === "PROVIDER_OUTPUT";
    const isHandle = block.obligationId === "draft" || block.obligationId.startsWith("composed:");
    const backed = isHandle || handled !== undefined;
    if (derivedProvider) {
      if (!block.text.trim()) continue;
      out.push(...authorizeProviderBlock({ ...block, source: "PROVIDER_OUTPUT" }, input.ctx, verification, input.language, handled?.safetyScope !== "UNRELATED"));
      continue;
    }
    if (!backed) {
      out.push(degradedBlock(block, "MISSING_AUTHORITY", input.ctx.safety.stopRule));
      continue;
    }
    out.push({ ...block, authority: "AUTHORITATIVE", verification: "NOT_REQUIRED", renderStatus: "NORMAL" });
  }
  const degraded = out.filter((b) => b.renderStatus === "DEGRADED").length;
  if (degraded >= 2) out.push(semanticBlock("composed:degraded_notice", aggregateDegradedNotice(degraded, input.language)));
  return out.map((b, order) => ({ ...b, order }));
}

/** Blocks for a bare string with no provenance: it is provider prose, hence UNVERIFIED (the fail-closed default). */
export function unverifiedDraftBlocks(draft: string): ResponseBlock[] {
  return draft.trim() ? [{ ...providerBlock("draft", "COMPOSED", draft.trim()), order: 0 }] : [];
}

/** Blocks from handled obligations with their real origin (used by the degraded fallback when no guarded blocks exist). */
export function blocksFromHandled(handled: readonly HandledObligation[]): ResponseBlock[] {
  return handled
    .filter((h) => h.text.trim())
    .map((h, order) => ({
      ...(h.origin === "PROVIDER_OUTPUT" ? providerBlock(h.id, h.disposition, h.text.trim()) : decisionBlock(h.id, h.disposition, h.text.trim())),
      order,
    }));
}
