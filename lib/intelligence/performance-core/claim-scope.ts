import { getRecord } from "./registry";
import { fold, hasTerm } from "./text";
import type { KnowledgeClaim, KnowledgeRecord } from "./types";

/**
 * Claim fidelity: FINAL_MATERIAL_CLAIM_SCOPE ⊆ SUPPORTED_EVIDENCE_SCOPE.
 *
 * A sentence asserting an effect of a registry entity on an outcome concept is compared with that entity's canonical
 * claims. MATCHES / NARROWS pass; BROADENS (an outcome the claims do not support, or a conditional finding stated as
 * unconditional) is a violation. The claims are the authority — this file only normalises outcome wording to a small
 * concept vocabulary so "builds strength" and "1RM strength" compare as the same outcome.
 *
 * ponytail: lexical concepts + subject-before-verb, one sentence at a time. Upgrade path is a claim extractor.
 */

type Concept = { id: string; label: { en: string; vi: string }; pattern: RegExp };

const w = (body: string) => new RegExp(`(?<![a-z0-9])(?:${body})(?![a-z0-9])`);

/** Outcome concepts the registry's claims are stated in. Not a blacklist: a concept is judged against each entity's claims. */
export const OUTCOME_CONCEPTS: readonly Concept[] = [
  { id: "STRENGTH", label: { en: "strength", vi: "sức mạnh" }, pattern: w("strength|stronger|1rm|one[- ]rep max|max(?:imal)? lifts?|suc manh") },
  { id: "HYPERTROPHY", label: { en: "muscle growth", vi: "tăng cơ" }, pattern: w("hypertroph\\w*|muscle (?:growth|gains?|mass|size|building)|(?:build|gain|grow)\\w* (?:more )?(?:lean )?muscles?|muscle-building|lean (?:mass|muscle)|fat-free mass|more muscle|bigger muscles?|tang co") },
  { id: "ENDURANCE", label: { en: "endurance", vi: "sức bền" }, pattern: w("endurance|stamina|aerobic capacity|suc ben") },
  { id: "RECOVERY", label: { en: "recovery", vi: "hồi phục" }, pattern: w("recover\\w*|hoi phuc") },
  { id: "SORENESS", label: { en: "soreness", vi: "đau mỏi cơ" }, pattern: w("soreness|sore|doms") },
  { id: "SLEEP", label: { en: "sleep", vi: "giấc ngủ" }, pattern: w("sleep\\w*|giac ngu") },
  { id: "FAT_LOSS", label: { en: "fat loss", vi: "giảm mỡ" }, pattern: w("fat loss|los\\w* (?:body )?fat|burn\\w* fat|body fat|weight loss|lose weight|giam mo") },
  { id: "TESTOSTERONE", label: { en: "testosterone", vi: "testosterone" }, pattern: w("testosterone|hormones?") },
  { id: "JOINT", label: { en: "joint health", vi: "khớp" }, pattern: w("joints?|tendons?|ligaments?|khop") },
  { id: "LIVER", label: { en: "the liver", vi: "gan" }, pattern: w("liver|hepat\\w*") },
  { id: "IMMUNE", label: { en: "immune function", vi: "miễn dịch" }, pattern: w("immun\\w*|mien dich") },
  { id: "POWER", label: { en: "power", vi: "sức bật" }, pattern: w("power|explosive\\w*") },
];

/** A verb that asserts an effect. Hedged forms ("may help") still assert one. */
const EFFECT_VERB = w("helps?|helped|helping|improv\\w*|reduc\\w*|support\\w*|boost\\w*|enhanc\\w*|promot\\w*|increas\\w*|rais\\w*|build\\w*|lead\\w* to|means?|drives?|gives? you|makes? you|works? for|good for|best for|effective for|(?:evidence|proven) for|ho tro|cai thien|giup|tang cuong|tang");
const NEGATION = /(?<![a-z])(?:no|not|never|dont|don't|doesn't|isn't|aren't|won't|without|unclear|unproven|khong|chua)(?![a-z])|n't/;
/** A universal or dose-response assertion: no registry claim holds unconditionally. */
const UNIVERSAL = /(?<![a-z])(?:always|every time|no matter|guarantee\w*|the more\b.*\bthe (?:more|better|bigger)|more \w+(?: \w+)? (?:always )?(?:means|equals|=) more|luon luon|cang nhieu cang)(?![a-z])/;
const CONDITION = /(?<![a-z])(?:unless|only if|if you|if your|when your|when you|as long as|up to|depends|depending|neu|tuy)(?![a-z])/;
/** A claim about side effects, dose or a decision never supports an outcome. Mirrors the registry's NOT_A_BENEFIT. */
const NOT_A_BENEFIT = /side effects?|tolerability|safety|effective dose|definition|decision to|priority/;

export type ScopeBroadening = { recordId: string; topic: string; concept: string; kind: "OUTCOME" | "CONDITION" };

const conceptById = (id: string) => OUTCOME_CONCEPTS.find((concept) => concept.id === id)!;

/** Claims that speak about the outcome at all, by their outcome, wording or record topic. */
function claimsOn(record: KnowledgeRecord, concept: Concept): KnowledgeClaim[] {
  return record.claims.filter((claim) => !NOT_A_BENEFIT.test(fold(claim.outcome)) && concept.pattern.test(fold(`${claim.outcome} ${claim.claim} ${record.topic}`)));
}

const supports = (claim: KnowledgeClaim) => claim.stance === "SUPPORTS" && claim.claimType !== "MECHANISM" && claim.claimType !== "UNKNOWN";

/**
 * Does the entity's canonical evidence leave this outcome unsupported? A supplement's claims are its whole canonical
 * evidence, so no supporting claim = broadened. Training and nutrition records are partial guidance: there only a claim
 * that explicitly does not support the outcome (with none supporting it) makes the assertion a broadening.
 */
function unsupported(record: KnowledgeRecord, concept: Concept): boolean {
  const on = claimsOn(record, concept);
  if (on.some(supports)) return false;
  return Boolean(record.supplement) || on.some((claim) => claim.stance === "DOES_NOT_SUPPORT");
}

const subjectTerms = (record: KnowledgeRecord) => [...new Set([...(record.aliases ?? []), ...record.retrievalTags])];

/** The broadenings one sentence makes about the in-scope records. Full canonical claims are read, never the outcome-scoped subset. */
export function scopeBroadeningsIn(sentence: string, records: readonly KnowledgeRecord[]): ScopeBroadening[] {
  const folded = fold(sentence);
  if (NEGATION.test(folded)) return [];
  const verb = folded.match(EFFECT_VERB);
  if (!verb || verb.index === undefined) return [];
  const before = folded.slice(0, verb.index);
  const object = folded.slice(verb.index);
  const asserted = OUTCOME_CONCEPTS.filter((concept) => concept.pattern.test(object));
  if (asserted.length === 0) return [];
  const found: ScopeBroadening[] = [];
  const full = records.map((record) => getRecord(record.id) ?? record).filter((record) => record.id !== "supplement-principles");
  for (const record of full) {
    if (!subjectTerms(record).some((term) => hasTerm(before, term))) continue;
    for (const concept of asserted) if (unsupported(record, concept)) found.push({ recordId: record.id, topic: record.topic, concept: concept.id, kind: "OUTCOME" });
  }
  // A finding with limits stated as universal ("more protein always means more muscle") broadens its condition.
  if (found.length === 0 && UNIVERSAL.test(folded) && !CONDITION.test(folded)) {
    const scoped = full.find((record) => asserted.some((concept) => claimsOn(record, concept).length > 0));
    if (scoped) found.push({ recordId: scoped.id, topic: scoped.topic, concept: asserted[0].id, kind: "CONDITION" });
  }
  return found;
}

/** What the entity's evidence does support, as its claims word the outcomes. */
function supportedOutcomes(record: KnowledgeRecord): string[] {
  const claims = (getRecord(record.id) ?? record).claims.filter((claim) => supports(claim) && !NOT_A_BENEFIT.test(fold(claim.outcome)));
  const strong = claims.filter((claim) => claim.evidenceStrength === "HIGH" || claim.evidenceStrength === "MODERATE");
  return (strong.length > 0 ? strong : claims).slice(0, 2).map((claim) => claim.outcome);
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The narrowed restatement of a broadened sentence. Built only from canonical claim wording: it adds no claim. */
export function scopedRestatement(broadening: ScopeBroadening, language: "en" | "vi"): string {
  const record = getRecord(broadening.recordId);
  const concept = conceptById(broadening.concept).label[language];
  if (broadening.kind === "CONDITION") {
    return language === "vi"
      ? `Hiệu quả với ${concept} có điều kiện và có giới hạn; nhiều hơn không phải lúc nào cũng tốt hơn.`
      : `The effect on ${concept} holds only under the conditions the evidence studied and has a ceiling; more is not always better.`;
  }
  const outcomes = record ? supportedOutcomes(record) : [];
  const topic = capitalise(broadening.topic);
  if (outcomes.length === 0) {
    return language === "vi" ? `${topic} chưa có hiệu quả được xác lập với ${concept} trong những gì mình kiểm tra được.` : `${topic} has no established effect on ${concept} in what I can check.`;
  }
  return language === "vi"
    ? `Bằng chứng của ${broadening.topic} là cho ${outcomes.join(" và ")}; điều đó không giống với một hiệu quả đã được chứng minh lên ${concept}.`
    : `${topic}'s evidence is for ${outcomes.join(" and ")}; that is not the same as an established effect on ${concept}.`;
}

/* ---------- negative claims: INSUFFICIENT != NO EFFECT, NO SOURCE FOUND != NO EVIDENCE, CONTEXT X != GENERALLY ---------- */

/** A sentence asserting the entity does nothing / has no effect. "Not established" / "limited" is calibration, not this. */
const NO_EFFECT = w("(?:does ?n[o']?t|do ?n[o']?t|won'?t|will not|did ?n[o']?t) (?:really |actually )?(?:work|help|do anything|do much|improve|increase|boost|raise|reduce|lower|affect|build|enhance)|(?:has|have|had) no (?:real |measurable |proven |meaningful )?(?:effect|benefit|impact)|no (?:real |proven |actual )?(?:effect|benefit) (?:on|for|at all)|(?:is|are) (?:useless|ineffective|pointless|a waste(?: of money)?)|not effective|there(?: is|'s) no (?:scientific )?evidence (?:that|it|they|for)|no evidence (?:that|it|they) (?:works?|helps?|improves?|does)|khong co tac dung|vo dung|khong hieu qua|khong giup");

export type NegativeOverclaim = { topic: string; recordId: string | null; concept: string | null; scopedClaim: string | null };

/**
 * A negative efficacy statement is supported only by a canonical DOES_NOT_SUPPORT claim on the outcome the sentence
 * names. A gap (no verified knowledge), an UNKNOWN/INSUFFICIENT claim, or a sentence that generalises a context-specific
 * null finding to "no effect" is an overclaim. `scopedClaim` is the canonical wording to restate, when one exists.
 */
export function negativeOverclaimsIn(sentence: string, records: readonly KnowledgeRecord[], gaps: ReadonlyArray<{ topic: string; retrievalTags: string[]; boundary?: string }>): NegativeOverclaim[] {
  const folded = fold(sentence);
  const cue = folded.match(NO_EFFECT);
  if (!cue || cue.index === undefined || CONDITION.test(folded)) return [];
  // "there is no evidence that creatine works": the subject follows the cue; otherwise it precedes it.
  const subject = /^(?:there|no evidence)/.test(cue[0]) ? folded.slice(cue.index) : folded.slice(0, cue.index);
  const asserted = OUTCOME_CONCEPTS.filter((concept) => concept.pattern.test(folded));
  // A term that is itself an outcome ("strength", "sleep") names what is affected, never the thing doing it.
  const names = (terms: string[]) => terms.some((term) => hasTerm(subject, term) && !OUTCOME_CONCEPTS.some((concept) => concept.pattern.test(term)));
  // The claim's own outcome wording counts too ("muscle protein synthesis" has no concept of its own).
  const statesOutcome = (claim: KnowledgeClaim) =>
    asserted.some((concept) => concept.pattern.test(fold(`${claim.outcome} ${claim.claim}`))) || fold(claim.outcome).split(/,\s*|\s+and\s+|\s+or\s+/).some((part) => part.length > 4 && folded.includes(part));
  const found: NegativeOverclaim[] = [];
  for (const record of records.map((entry) => getRecord(entry.id) ?? entry).filter((entry) => entry.id !== "supplement-principles")) {
    if (!names(subjectTerms(record))) continue;
    const negative = record.claims.filter((claim) => claim.stance === "DOES_NOT_SUPPORT" && claim.claimType !== "UNKNOWN" && claim.evidenceStrength !== "INSUFFICIENT");
    const onOutcome = negative.filter(statesOutcome);
    if (onOutcome.length > 0) continue;
    // Canonical wording replaces only a GENERAL "it does nothing"; a null finding on another outcome is never substituted in.
    found.push({ topic: record.topic, recordId: record.id, concept: asserted[0]?.id ?? null, scopedClaim: asserted.length === 0 ? (negative[0]?.claim ?? null) : null });
  }
  for (const gap of gaps) {
    if (gap.boundary === "PED_DRUG" || !names(gap.retrievalTags)) continue;
    found.push({ topic: gap.topic, recordId: null, concept: asserted[0]?.id ?? null, scopedClaim: null });
  }
  return found;
}

/** The calibrated replacement for an unsupported negative sentence. Canonical wording when a scoped null finding exists. */
export function negativeRestatement(overclaim: NegativeOverclaim, language: "en" | "vi"): string {
  if (overclaim.scopedClaim && language === "en") return overclaim.scopedClaim;
  const concept = overclaim.concept ? conceptById(overclaim.concept).label[language] : null;
  const topic = capitalise(overclaim.topic);
  return language === "vi"
    ? `${topic}: chưa có lợi ích${concept ? ` cho ${concept}` : ""} được xác lập trong nguồn mình kiểm tra được — điều đó không có nghĩa là nó chắc chắn không có tác dụng.`
    : `${topic}: a benefit${concept ? ` for ${concept}` : ""} isn't established in the sources I can check — that isn't evidence that it does nothing.`;
}

/** The supported scope of an entity, for a correction brief. */
export function supportedScopeLine(broadening: ScopeBroadening): string {
  const record = getRecord(broadening.recordId);
  const outcomes = record ? supportedOutcomes(record) : [];
  const concept = conceptById(broadening.concept).label.en;
  if (broadening.kind === "CONDITION") return `You stated the effect on ${concept} as unconditional ("always", "more means more"). The evidence holds only under its stated conditions and has limits; say so.`;
  return outcomes.length > 0
    ? `You stated an effect of ${broadening.topic} on ${concept}. Its evidence covers ${outcomes.join("; ")} — not ${concept}. Revise only that sentence: state what the evidence does cover, and that it is not the same as a proven effect on ${concept}. Keep every other part of the answer as it was.`
    : `You stated an effect of ${broadening.topic} on ${concept}, which nothing here supports. Revise only that sentence to say no effect on ${concept} is established. Keep every other part of the answer as it was.`;
}
