import { NUTRITION_RECORDS } from "./knowledge/nutrition";
import { KNOWLEDGE_GAPS, SUPPLEMENT_RECORDS } from "./knowledge/supplements";
import { TRAINING_RECORDS } from "./knowledge/training";
import { parseCandidateRequest } from "./candidates";
import { OUTCOME_CONCEPTS } from "./claim-scope";
import { strongestSupport } from "./policy";
import { getSource } from "./sources";
import { fold, hasTerm, termSpans, tokens } from "./text";
import type {
  CandidateRequest, ClaimEvidenceScope, ClaimSupport, DefinedEntity, EvidenceConclusion, EntityStatus, EvidenceStrength, IdentityGrounding, KnowledgeClaim, KnowledgeGap,
  KnowledgeRecord, KnowledgeResolution, RequestedOutcome, StudyPopulation, TargetClass, TurnApplicability,
} from "./types";

/** The canonical Knowledge Registry: one list, both coaches. */
export const KNOWLEDGE_RECORDS: readonly KnowledgeRecord[] = [...TRAINING_RECORDS, ...NUTRITION_RECORDS, ...SUPPLEMENT_RECORDS];
export { KNOWLEDGE_GAPS };

const PRINCIPLES_ID = "supplement-principles";
const MAX_NAMED_RECORDS = 4;

export function getRecord(id: string): KnowledgeRecord | null {
  return KNOWLEDGE_RECORDS.find((record) => record.id === id) ?? null;
}

/** Structural self-check of the registry (run by the test suite): every problem is a string, [] means sound. */
export function validateRegistry(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const record of KNOWLEDGE_RECORDS) {
    if (ids.has(record.id)) problems.push(`duplicate record id ${record.id}`);
    ids.add(record.id);
    if (record.claims.length === 0) problems.push(`${record.id}: no claims`);
    for (const id of record.sources) if (!getSource(id)) problems.push(`${record.id}: unknown source ${id}`);
    for (const c of record.claims) {
      if (c.claimType !== "UNKNOWN" && c.sourceIds.length === 0) problems.push(`${record.id}: sourced claim type ${c.claimType} cites nothing`);
      if (c.claimType === "UNKNOWN" && c.evidenceStrength !== "INSUFFICIENT") problems.push(`${record.id}: UNKNOWN claim must be INSUFFICIENT`);
      if (c.claimType === "MECHANISM" && /\b(?:improves?|builds?|increases? (?:muscle|strength))\b/i.test(c.outcome)) problems.push(`${record.id}: mechanism claim names a benefit outcome`);
      for (const id of c.sourceIds) if (!record.sources.includes(id)) problems.push(`${record.id}: claim cites ${id} outside record.sources`);
    }
    for (const tag of record.retrievalTags) if (tag !== fold(tag)) problems.push(`${record.id}: tag "${tag}" is not folded`);
    if (record.supplement && !record.identity) problems.push(`${record.id}: supplement has no identity`);
  }
  for (const gap of KNOWLEDGE_GAPS) if (!gap.identity) problems.push(`gap ${gap.topic}: no identity`);
  const owners = new Map<string, string>();
  for (const entity of definedEntities()) {
    if (entity.identity && !entity.aliases?.length) problems.push(`${entity.topic}: identity without an alias`);
    for (const alias of entity.aliases ?? []) {
      if (alias !== fold(alias)) problems.push(`${entity.topic}: alias "${alias}" is not folded`);
      const owner = owners.get(alias);
      if (owner && owner !== entity.topic) problems.push(`alias "${alias}" names both ${owner} and ${entity.topic}`);
      owners.set(alias, entity.topic);
    }
  }
  return problems;
}

/** Every entity a question can name: records (not the generic principles), gaps, and their related entities. */
function definedEntities(): DefinedEntity[] {
  return [...KNOWLEDGE_RECORDS.filter((record) => record.id !== PRINCIPLES_ID), ...KNOWLEDGE_GAPS].flatMap((entity) => [entity, ...(entity.related ?? [])]);
}

/**
 * Identity resolution, separate from retrieval: only an alias names an entity, so a retrieval tag reaching a topic
 * never makes that topic the thing asked about. A hit inside a longer hit of another entity loses ("sleep" in "sleep aid").
 */
function identityMatchesOf(folded: string): DefinedEntity[] {
  const hits = definedEntities().flatMap((entity) => (entity.aliases ?? []).flatMap((alias) => termSpans(folded, alias).map(([start, end]) => ({ entity, start, end }))));
  const outer = hits.filter((hit) => !hits.some((other) => other.entity !== hit.entity && other.start <= hit.start && other.end >= hit.end && other.end - other.start > hit.end - hit.start));
  return [...new Set(outer.sort((a, b) => a.start - b.start).map((hit) => hit.entity))];
}

/** Asks for the evidence itself: the one case where canonical knowledge alone is not specific enough. */
const SOURCE_CUE = ["study", "studies", "research", "evidence", "source", "sources", "citation", "proof", "meta-analysis", "latest", "nghien cuu", "bang chung", "nguon"];

function scoreRecord(folded: string, record: KnowledgeRecord): number {
  // Longer tags are more specific ("training to failure" outranks "failure").
  return record.retrievalTags.reduce((score, tag) => (hasTerm(folded, tag) ? score + 1 + tag.split(" ").length : score), 0);
}

/* ---------- requested outcome ---------- */

// A request for a pick. Folded text.
const PICK_ASK = /(?<![a-z])(?:best|top|recommend\w*|what (?:\w+ ){0,2}(?:should|can|do) i (?:take|use|eat|drink|do|try)|which (?:\w+ ){0,2}(?:should|is better|works best)|tot nhat|nen (?:uong|dung|an|tap) gi)(?![a-z])/;
// The outcome is the complement of "for" / "to <verb>" / "cho", up to the end of the clause.
const OUTCOME_OF = /(?<![a-z])(?:for|to (?:help(?: with)?|improve|boost|support|fix|build|increase|reduce|lower|break)|cho)\s+((?:[a-z0-9-]+\s*){1,5}?)\s*(?:[?.!,;]|$|\s(?:and|or|but|if|when|while|without|so|because)\s)/;
// An evidence question about an effect: "does X reduce Y", "is X good for Y". Adverse questions ("bad for", "cause") are not.
const EFFECT_OF = /(?<![a-z])(?:does|do|can|will|would|could|is|are)(?![a-z])[^?.!]{0,40}?(?<![a-z])(?:help(?:s|ing)?(?: with)?|reduc\w*|lower\w*|improv\w*|increas\w*|boost\w*|protect\w*|support\w*|treat\w*|prevent\w*|good for|work for)\s+((?:[a-z0-9-]+\s*){1,5}?)\s*(?:[?.!,;]|$|\s(?:and|or|but|if|when|while|without|so|because|in|at)\s)/;
const OUTCOME_FILLER = new Set(["my", "your", "the", "a", "an", "better", "good", "more", "overall", "general", "some", "you", "me", "it", "them", "toi", "minh", "em"]);
export const TARGET_CLASS: ReadonlyArray<[Exclude<TargetClass, "UNSPECIFIED">, RegExp]> = [
  ["SUPPLEMENT", /(?<![a-z])(?:supplements?|supps?|stack|pills?|take|thuc pham bo sung|thuc pham chuc nang|tpbs|nen uong)(?![a-z])/],
  ["EXERCISE", /(?<![a-z])(?:exercises?|workouts?|movements?|lifts?|stretch\w*|routine|programs?|bai tap|nen tap)(?![a-z])/],
  ["FOOD", /(?<![a-z])(?:foods?|meals?|diet|snacks?|eat|drink|mon an|nen an)(?![a-z])/],
];
// ponytail: a class vocabulary (symptom, organ, lab marker, hormone, disease), not a topic list. The nutrition screen's
// CLINICAL_TARGET stays the hard-stop owner; this only keeps a pick from being ranked for an outcome naming one of these.
const HEALTH_OUTCOME = /(?<![a-z])(?:pain\w*|hurt\w*|ach(?:e|es|ing)|injur\w*|tendon\w*|tendinitis|liver|hepat\w*|kidneys?|renal|heart|cholesterol|ldl|blood (?:pressure|sugar|glucose)|glucose|diabet\w*|testosterone|hormones?|thyroid|gut|digestion|immun\w*|inflammation|anxiety|depression|gan|huyet ap|tieu duong)(?![a-z])/;
// The baseline performance set exists for this outcome: "best supplement for strength / muscle growth" IS the open question.
const PERFORMANCE_PURPOSE = /(?<![a-z])(?:strength|stronger|power|hypertrophy|(?:muscle|lean) (?:gain|growth|mass|size|building)|(?:gain|grow|build)\w* muscles?|gains|bulk\w*|tang co|suc manh)(?![a-z])|^muscles?$/;
// Modifiers that name no outcome on their own ("muscle recovery" is about recovery).
const GENERIC_OUTCOME = new Set(["health", "healthy", "function", "muscle", "muscles", "body", "overall", "daily"]);
// A claim about side effects, dose or a decision is never evidence that something achieves an outcome.
const NOT_A_BENEFIT = /side effects?|tolerability|safety|effective dose|definition|decision to|priority/;

/**
 * "best supps for my liver" → PICK × SUPPLEMENT × "liver"; "does omega-3 reduce liver fat?" → EFFECT × "liver fat".
 * null when the turn asks for neither a pick nor an effect, or names no outcome.
 */
function requestedOutcomeOf(folded: string): RequestedOutcome | null {
  const pick = PICK_ASK.test(folded);
  const words = (pick ? folded.match(OUTCOME_OF) : folded.match(EFFECT_OF))?.[1]?.trim().split(/\s+/).filter((word) => !OUTCOME_FILLER.has(word));
  if (!words?.length) return null;
  const phrase = words.join(" ");
  const targetClass = TARGET_CLASS.find(([, pattern]) => pattern.test(folded))?.[0] ?? "UNSPECIFIED";
  return { ask: pick ? "PICK" : "EFFECT", phrase, targetClass, healthSensitive: HEALTH_OUTCOME.test(phrase) };
}

/** The outcome's content words, each with its singular/plural variants ("joints" → ["joints", "joint"]). */
function outcomeWords(outcome: RequestedOutcome): string[][] {
  return tokens(outcome.phrase).filter((word) => word.length >= 3 && !GENERIC_OUTCOME.has(word)).map((word) => (word.endsWith("s") && word.length > 4 ? [word, word.slice(0, -1)] : [word]));
}
const outcomeTerms = (outcome: RequestedOutcome) => outcomeWords(outcome).flat();

const namesTerm = (folded: string, terms: string[]) => terms.some((term) => hasTerm(folded, term) || hasTerm(folded, `${term}s`));

/**
 * The claims that speak to the outcome as an effect: their outcome names it, or — for a claim asserting an effect —
 * the effect it states does ("…benefits for muscular endurance…"). ponytail: lexical; a claim extractor is the upgrade.
 */
function outcomeClaims(record: KnowledgeRecord, terms: string[]): KnowledgeClaim[] {
  return record.claims.filter((claim) => !NOT_A_BENEFIT.test(fold(claim.outcome))
    && (namesTerm(fold(claim.outcome), terms) || (claim.stance === "SUPPORTS" && namesTerm(fold(claim.claim), terms))));
}

const SUPPORT_RANK: Record<EvidenceStrength, number> = { HIGH: 4, MODERATE: 3, LIMITED: 2, THEORETICAL: 1, INSUFFICIENT: 0 };

/** A supplement pick scoped to a named outcome (not the baseline performance question). */
function outcomeScopedPick(outcome: RequestedOutcome | null | undefined, open: boolean): outcome is RequestedOutcome {
  return Boolean(outcome && outcome.ask === "PICK" && outcome.targetClass === "SUPPLEMENT" && !open && !PERFORMANCE_PURPOSE.test(outcome.phrase));
}

/**
 * "does <supplement> <effect> <outcome>?": each named supplement keeps only its claims about that outcome. One with none
 * becomes a known gap for that entity × outcome, so its other claims never lend their strength to this one and the
 * existing gap path (selective retrieval, downgrade posture, benefit enforcement) applies. Performance outcomes the
 * performance claims already address are left whole.
 */
function scopeEffect(records: KnowledgeRecord[], outcome: RequestedOutcome): { records: KnowledgeRecord[]; gaps: KnowledgeGap[] } {
  const terms = outcomeTerms(outcome);
  const scoped = records.map((record) => (record.supplement ? { ...record, claims: outcomeClaims(record, terms) } : record));
  return {
    records: scoped.filter((record) => record.claims.length > 0),
    gaps: scoped.filter((record) => record.claims.length === 0).map((record) => ({
      topic: `${record.topic} for ${outcome.phrase}`,
      domain: record.domain,
      retrievalTags: record.retrievalTags,
      reason: `no canonical claim covers ${outcome.phrase} for ${record.topic}; its claims about other outcomes do not transfer`,
    })),
  };
}

type Match = { records: KnowledgeRecord[]; gaps: KnowledgeGap[]; open: boolean; outcome: RequestedOutcome | null; request: CandidateRequest | null };

/**
 * An explicit candidate set decides the turn's entities: EVERY candidate's record or gap is in scope (no top-N cap), and
 * words outside the list (the criterion "for pre-workout", the context "protein target") never bind another entity.
 * Boundary gaps reached anywhere in the message stay, so safety sees "anavar" whether or not it parsed as a candidate.
 */
function matchCandidates(folded: string, request: CandidateRequest, boundary: KnowledgeGap[]): Match {
  const topics = new Set(request.candidates.flatMap((candidate) => (candidate.entity ? [candidate.entity] : [])));
  let records = KNOWLEDGE_RECORDS.filter((record) => topics.has(record.topic));
  const gaps = [...KNOWLEDGE_GAPS.filter((gap) => topics.has(gap.topic)), ...boundary.filter((gap) => !topics.has(gap.topic))];
  // A named outcome ("for sleep") scopes each candidate's claims like an effect question; the known criteria do not.
  const phrase = request.criterion === "OUTCOME" ? request.criterionPhrase : null;
  const supplementSet = records.some((record) => record.supplement);
  const labels = request.candidates.map((candidate) => candidate.label).join(" ");
  const outcome: RequestedOutcome | null = phrase
    // The class comes from the candidates, never the criterion: "for pre-workout" does not make rice an exercise.
    ? { ask: "PICK", phrase, targetClass: supplementSet ? "SUPPLEMENT" : TARGET_CLASS.find(([, pattern]) => pattern.test(labels))?.[0] ?? "UNSPECIFIED", healthSensitive: HEALTH_OUTCOME.test(phrase) }
    : null;
  if (outcome && supplementSet && !PERFORMANCE_PURPOSE.test(phrase!)) {
    const effect = scopeEffect(records, outcome);
    records = effect.records;
    gaps.push(...effect.gaps);
  }
  return { records, gaps, open: false, outcome, request };
}

const SUPPLEMENT_CUE = TARGET_CLASS.find(([kind]) => kind === "SUPPLEMENT")![1];

function match(folded: string): Match {
  const scored = KNOWLEDGE_RECORDS.map((record) => ({ record, score: scoreRecord(folded, record) })).filter((entry) => entry.score > 0);
  const named = scored.filter((entry) => entry.record.id !== PRINCIPLES_ID).sort((a, b) => b.score - a.score).slice(0, MAX_NAMED_RECORDS).map((entry) => entry.record);
  const gaps = KNOWLEDGE_GAPS.filter((gap) => gap.retrievalTags.some((tag) => hasTerm(folded, tag)));
  const generic = scored.some((entry) => entry.record.id === PRINCIPLES_ID);
  const namedSupplement = named.some((record) => record.supplement) || gaps.length > 0;
  let request = parseCandidateRequest(folded, (label) => identityMatchesOf(label)[0] ?? null, identityMatchesOf(folded));
  if (request && request.candidates.length > 0) return matchCandidates(folded, request, gaps.filter((gap) => gap.boundary));
  // A buy / skip decision with nothing named is a supplement purchase only when the turn is about supplements.
  if (request && !(generic || namedSupplement || SUPPLEMENT_CUE.test(folded))) request = null;
  const outcome = requestedOutcomeOf(folded);
  const pick = outcome?.ask === "PICK" && outcome.targetClass === "SUPPLEMENT" && !namedSupplement;
  // "best supplement for <outcome>" is not "what supplements should I take": the outcome picks the candidates, each
  // carrying only its claims about that outcome. A candidate's claim about something else never backs this pick.
  if (pick && outcomeScopedPick(outcome, false)) {
    const terms = outcomeTerms(outcome);
    const candidates = KNOWLEDGE_RECORDS
      .filter((record) => record.supplement)
      .map((record) => ({ ...record, claims: outcomeClaims(record, terms) }))
      .filter((record) => record.claims.length > 0)
      .sort((a, b) => SUPPORT_RANK[strongestSupport(b) ?? "INSUFFICIENT"] - SUPPORT_RANK[strongestSupport(a) ?? "INSUFFICIENT"])
      .slice(0, MAX_NAMED_RECORDS);
    // A known gap named for this outcome ("melatonin and sleep aids") is a candidate the project holds no evidence for:
    // it stays in scope as a gap, so a benefit asserted for it is caught like any other gap benefit.
    const outcomeGaps = KNOWLEDGE_GAPS.filter((gap) => !gaps.includes(gap) && namesTerm(fold([gap.topic, ...gap.retrievalTags].join(" ")), terms));
    return { records: [...candidates, ...named.filter((record) => !record.supplement)], gaps: [...gaps, ...outcomeGaps], open: false, outcome, request };
  }
  if (outcome?.ask === "EFFECT" && named.some((record) => record.supplement) && !PERFORMANCE_PURPOSE.test(outcome.phrase)) {
    const effect = scopeEffect(named, outcome);
    return { records: effect.records, gaps: [...gaps, ...effect.gaps], open: false, outcome, request };
  }
  return { records: named, gaps, open: (generic || pick || Boolean(request)) && !namedSupplement, outcome, request };
}

const NAME_STOP = new Set(["the", "and", "with", "for", "you", "your", "this", "that", "from", "about", "than", "are", "can", "not", "any", "how", "does", "dose", "what", "supplement", "supplements", "product", "products", "unknown", "brand", "versus", "compare"]);

function knownName(name: string): boolean {
  const tags = [
    ...KNOWLEDGE_RECORDS.flatMap((record) => record.retrievalTags),
    ...KNOWLEDGE_GAPS.flatMap((gap) => gap.retrievalTags),
  ];
  return tags.some((tag) => tag === name || hasTerm(name, tag));
}

/** Product tokens the question names that no record or gap covers. Requires a supplement/product cue so ordinary words stay untouched. */
function unresolvedProductNames(folded: string): string[] {
  if (!/\b(?:supplements?|products?)\b/.test(folded)) return [];
  const sides: string[] = [];
  const defined = folded.match(/\bwhat is\s+([a-z0-9][a-z0-9-]{2,})/);
  if (defined) sides.push(defined[1]);
  const compared = folded.match(/\bcompare\s+(.+?)\s+(?:and|with|vs\.?|versus)\s+(.+?)$/);
  if (compared) sides.push(compared[1], compared[2]);
  const names: string[] = [];
  for (const side of sides) {
    const cleaned = side.replace(/\b(?:supplements?|products?)\b/g, " ").replace(/[?.!]/g, " ").trim();
    const token = cleaned.split(/\s+/).filter((part) => part.length >= 3 && !NAME_STOP.has(part) && part !== "an")[0];
    if (!token) {
      if (/\b(?:unknown|another|something)\b/.test(cleaned) || cleaned.length === 0) names.push("that product");
      continue;
    }
    if (!knownName(token) && !names.includes(token)) names.push(token);
  }
  return names;
}

function entityOf(folded: string, found: { records: KnowledgeRecord[]; gaps: KnowledgeGap[] }, unresolved: string[], named: boolean): { entityStatus: EntityStatus; unresolvedEntities: string[] } {
  const variant = /\b(?:ingredients|which version|which formula|better for me)\b/.test(folded);
  const ambiguous = /\b(?:not sure which|which brand|which product)\b/.test(folded);
  if (unresolved.length > 0 && found.records.length === 0 && found.gaps.length === 0) return { entityStatus: "UNKNOWN_ENTITY", unresolvedEntities: unresolved };
  if (ambiguous && (found.records.length > 0 || found.gaps.length > 0)) return { entityStatus: "AMBIGUOUS_ENTITY", unresolvedEntities: unresolved };
  if (variant && found.gaps.length > 0 && found.records.length === 0) return { entityStatus: "VARIANT_REQUIRED", unresolvedEntities: unresolved };
  if (named) return { entityStatus: "KNOWN", unresolvedEntities: unresolved };
  if (found.records.length > 0 || found.gaps.length > 0) return { entityStatus: "RELATED_TOPIC", unresolvedEntities: unresolved };
  return { entityStatus: "NOT_ASSESSED", unresolvedEntities: [] };
}

/**
 * Recognising a name (EntityStatus) is not knowing what it is. Judged only on the entities the question names by alias:
 * a topic reached through a related retrieval tag lends no identity (RELATED_TOPIC → ABSENT). A named record without
 * an authored identity is PARTIAL.
 */
function identityGroundingOf(matches: DefinedEntity[], entityStatus: EntityStatus): IdentityGrounding {
  if (entityStatus === "UNKNOWN_ENTITY" || entityStatus === "RELATED_TOPIC") return "ABSENT";
  if (matches.length === 0) return "NOT_ASSESSED";
  return matches.every((entity) => entity.identity) ? "GROUNDED" : "PARTIAL";
}

/** The turn's records are scoped to a requested supplement outcome (each candidate carries only its claims about it). */
function outcomeScoped(resolution: KnowledgeResolution): boolean {
  return outcomeScopedPick(resolution.requestedOutcome, resolution.openSupplementRequest);
}

/**
 * DIRECT = the record is what the question is about: an outcome candidate, an entity named by alias, or (when nothing is
 * named) the topic its own words reached. BACKGROUND = general framing (the supplement principles, a topic reached by a
 * tag beside a named entity, a non-candidate on an outcome pick). Background never backs a clinical or performance claim.
 */
function supportOf(resolution: KnowledgeResolution, record: KnowledgeRecord): ClaimSupport {
  if (record.id === PRINCIPLES_ID) return "BACKGROUND";
  if (outcomeScoped(resolution)) return record.supplement ? "DIRECT" : "BACKGROUND";
  const named = resolution.identityMatches ?? [];
  return named.length === 0 || named.some((entity) => entity.topic === record.topic) ? "DIRECT" : "BACKGROUND";
}

/** Per-claim scope and its sources: the claim ↔ source linkage. One entity can be SUPPORTED on one outcome and UNKNOWN on another. */
export function claimEvidenceScopes(resolution: KnowledgeResolution): ClaimEvidenceScope[] {
  return resolution.records.flatMap((record) => record.claims.map((claim) => ({
    recordId: record.id,
    entity: record.topic,
    outcome: claim.outcome,
    population: claim.population,
    context: claim.context,
    conclusion: conclusionOf(claim),
    support: supportOf(resolution, record),
    sourceIds: claim.sourceIds,
  })));
}

/**
 * Canonical sources an answer may show. A source qualifies only through a claim in this turn's scope, and — given the
 * final reply — only when that reply names the claim's entity. Canonical is a trusted collection, not a relevant one:
 * a creatine paper never backs a sleep or liver answer that does not discuss creatine. Without `reply`, the candidates.
 */
export function citedCanonicalSources(resolution: KnowledgeResolution, reply?: string): Array<{ sourceId: string; support: ClaimSupport }> {
  const folded = reply === undefined ? null : fold(reply);
  const cited = new Map<string, ClaimSupport>();
  const isOutcome = (term: string) => OUTCOME_CONCEPTS.some((concept) => concept.pattern.test(term));
  const supplementTurn = resolution.records.some((record) => record.supplement && record.id !== PRINCIPLES_ID);
  for (const scope of claimEvidenceScopes(resolution)) {
    const record = resolution.records.find((entry) => entry.id === scope.recordId);
    if (!record) continue;
    // A retrieval tag that is itself an outcome ("strength", "muscle growth") names what is affected, not this record.
    // On a supplement turn the same holds for a training/nutrition record's aliases: "creatine for strength" must not
    // pull in strength-training papers. The topic always names it.
    const aliases = supplementTurn && !record.supplement ? (record.aliases ?? []).filter((alias) => !isOutcome(alias)) : (record.aliases ?? []);
    const names = [...record.retrievalTags.filter((tag) => !isOutcome(tag)), ...aliases, fold(record.topic)];
    if (folded !== null && !names.some((term) => hasTerm(folded, term))) continue;
    for (const id of scope.sourceIds) if (cited.get(id) !== "DIRECT") cited.set(id, scope.support);
  }
  return [...cited].map(([sourceId, support]) => ({ sourceId, support }));
}

/**
 * Is a retrieved document about what this turn asks? It must name an entity the turn is about and, when an outcome is
 * asked, every word of that outcome, at least one of them in its title. null = the turn names nothing to judge against
 * (not assessed). A search that returned papers executed successfully; only relevant papers are evidence.
 */
export function retrievedDocumentRelevant(resolution: KnowledgeResolution, title: string, abstract = ""): boolean | null {
  const entities = [
    ...resolution.gaps.flatMap((gap) => [...gap.retrievalTags, ...(gap.aliases ?? [])]),
    ...resolution.records.filter((record) => supportOf(resolution, record) === "DIRECT").flatMap((record) => [...record.retrievalTags, ...(record.aliases ?? [])]),
  ];
  const outcome = resolution.requestedOutcome ? outcomeWords(resolution.requestedOutcome) : [];
  if (entities.length === 0 && outcome.length === 0) return null;
  const head = fold(title);
  const body = `${head} ${fold(abstract)}`;
  return (entities.length === 0 || entities.some((term) => hasTerm(body, term)))
    && (outcome.length === 0 || (outcome.every((variants) => namesTerm(body, variants)) && outcome.some((variants) => namesTerm(head, variants))));
}

const ANIMAL = /(?<![a-z])(?:mice|mouse|murine|rats?|rodents?|hamsters?|rabbits?|piglets?|porcine|bovine|canine|zebrafish|drosophila|c\. elegans|primates?|monkeys?|animal models?|knockout|c57bl\/6\w*|high-fat diet-fed|hfd-fed)(?![a-z])/;
const IN_VITRO = /(?<![a-z])(?:in vitro|cell lines?|cultured|cell cultures?|hepg2|caco-2|c2c12|organoids?)(?![a-z])/;
const HUMAN = /(?<![a-z])(?:humans?|patients|participants|volunteers|adults|men|women|children|adolescents|athletes|randomi[sz]ed|placebo|double-blind|clinical trials?|cohort|cross-sectional|case-control|observational)(?![a-z])/;
// Next to an animal/cell cue, only a human study DESIGN counts: an animal abstract's background often mentions "patients".
const HUMAN_DESIGN = /(?<![a-z])(?:human (?:participants|subjects|volunteers|trials?|studies)|participants|volunteers|men and women|healthy (?:men|women|subjects|individuals)|randomi[sz]ed|placebo|double-blind|clinical trials?|cohort|cross-sectional|case-control|observational)(?![a-z])/;

/**
 * Who a retrieved document studied, from its own title and abstract — never guessed: no population cue is UNKNOWN.
 * The title decides when the abstract mixes cues (an animal paper's background often mentions patients).
 * ponytail: lexical cues on title/abstract; upgrade path is PubMed publication-type / MeSH metadata.
 */
export function retrievedPopulation(title: string, abstract = ""): StudyPopulation {
  const head = fold(title);
  const body = `${head} ${fold(abstract)}`;
  const animal = ANIMAL.test(body);
  const vitro = IN_VITRO.test(body);
  if (!animal && !vitro) return HUMAN.test(body) ? "HUMAN_RELEVANT" : "UNKNOWN";
  const preclinical = animal ? "ANIMAL_PRECLINICAL" : "IN_VITRO";
  if (!HUMAN_DESIGN.test(body)) return preclinical;
  const preclinicalTitle = ANIMAL.test(head) || IN_VITRO.test(head);
  if (!preclinicalTitle) return HUMAN_DESIGN.test(head) ? "HUMAN_RELEVANT" : "MIXED";
  return HUMAN_DESIGN.test(head) ? "MIXED" : preclinical;
}

/** The relevant retrieved set as a whole: human (or mixed) studies are what can support a statement about people. */
export function turnApplicability(populations: readonly StudyPopulation[]): TurnApplicability {
  if (populations.length === 0) return "NOT_ASSESSED";
  const human = populations.some((population) => population === "HUMAN_RELEVANT" || population === "MIXED");
  const preclinical = populations.some((population) => population === "ANIMAL_PRECLINICAL" || population === "IN_VITRO");
  if (human) return preclinical || populations.includes("MIXED") ? "MIXED" : "HUMAN_RELEVANT";
  return populations.every((population) => population === "ANIMAL_PRECLINICAL" || population === "IN_VITRO") ? "PRECLINICAL_ONLY" : "UNKNOWN";
}

function conclusionOf(claim: KnowledgeClaim): EvidenceConclusion {
  if (claim.claimType === "UNKNOWN") return "UNKNOWN";
  if (claim.stance === "MIXED" || /disagree|different conclusions|conflict/i.test(claim.uncertainty)) return "CONFLICTING";
  if (claim.stance === "DOES_NOT_SUPPORT") return "INSUFFICIENT";
  if (claim.evidenceStrength === "HIGH" || claim.evidenceStrength === "MODERATE") return "SUPPORTED";
  if (claim.evidenceStrength === "LIMITED" || claim.evidenceStrength === "THEORETICAL") return "LIMITED";
  return "INSUFFICIENT";
}

/** Prompt line for a retrieval outcome. Null when this turn was not a search. */
export function knowledgeEvidenceLine(knowledge: KnowledgeResolution): string | null {
  if (knowledge.retrievalStatus === "FAILED") return "Retrieval failed before any sources were checked. Say the check did not finish. Do not say there is no evidence, and do not invent a benefit.";
  if (knowledge.coverage === "NO_MATCH_IN_SEARCHED_CORPUS" && knowledge.retrievalStatus !== "NOT_REQUESTED") return "No match in the sources searched for the gap above. That is not a finding that no scientific evidence exists. Do not write \"there is no scientific evidence\" or \"there is no evidence\". Canonical claims above still stand when they are present. A benefit for the gap is not established here.";
  if (knowledge.retrievalStatus === "PARTIAL" && knowledge.retrievalReasons.includes("retrieval_partial")) {
    return [populationLine(knowledge), "One source search did not finish. Use only the evidence that came back; say nothing about what the unfinished search might have found."].filter(Boolean).join(" ");
  }
  if (knowledge.retrievalStatus === "PARTIAL") return "Canonical claims above still stand. The gap had no match in the sources searched. Do not treat that miss as proof that no evidence exists, and do not rank a benefit for the gap.";
  return populationLine(knowledge);
}

/** Relevant is not applicable: what the retrieved studies may support depends on who they studied (each item's `population`). */
function populationLine(knowledge: KnowledgeResolution): string | null {
  const health = knowledge.requestedOutcome?.healthSensitive ?? false;
  switch (knowledge.populationApplicability) {
    case "PRECLINICAL_ONLY":
      return "POPULATION: every retrieved study here is preclinical (animal or cell). Mention it only as preclinical background, labelled as such (\"in mice…\"); it is not evidence of an effect in people, so state that no effect in people is established here.";
    case "MIXED":
      return "POPULATION: the retrieved studies mix human and preclinical work (see each item's population). Only the human studies can support a statement about people; label any animal or cell finding as preclinical background, never as support for the answer.";
    case "UNKNOWN":
      return health
        ? "POPULATION: who the retrieved studies were done in could not be determined. For this health question, do not state an effect in people from them; describe them as studies whose applicability is unassessed."
        : "POPULATION: who the retrieved studies were done in could not be determined. Treat their applicability as unassessed and keep any claim from them tentative.";
    default:
      return null;
  }
}

/**
 * Message → what the project canonically knows about it. Pure and synchronous: no retrieval happens here, only the
 * decision of whether retrieval is warranted (selective retrieval policy).
 *
 *   CANONICAL_KNOWLEDGE_AVAILABLE  a record covers the topic → answer from it, no retrieval
 *   RETRIEVAL_REQUIRED             a known gap, or the user asks for the evidence itself → retrieve selectively
 *   KNOWLEDGE_INSUFFICIENT         a known gap and nothing to retrieve from → lower certainty / say unknown
 */
export function resolveKnowledge(input: { message: string; priorUserMessages?: string[]; canRetrieve: boolean }): KnowledgeResolution {
  let folded = fold(input.message);
  let found = match(folded);
  // A short follow-up ("is it necessary?", "in english bro") continues the previous user topic.
  const empty = found.records.length === 0 && found.gaps.length === 0 && !found.open && found.outcome?.ask !== "PICK" && !found.request;
  const previous = input.priorUserMessages?.at(-1);
  if (empty && previous && tokens(folded).length <= 7) {
    folded = `${fold(previous)} ${folded}`;
    found = match(folded);
  }

  const unresolved = unresolvedProductNames(folded);
  // On a candidate decision only the candidates are named entities: "for pre-workout" is a criterion, not a product.
  const candidateTopics = new Set(found.request?.candidates.flatMap((candidate) => (candidate.entity ? [candidate.entity] : [])) ?? []);
  const identityMatches = identityMatchesOf(folded).filter((entity) => !found.request?.candidates.length || candidateTopics.has(entity.topic));
  const entity = entityOf(folded, found, unresolved, identityMatches.length > 0);
  if (entity.entityStatus === "UNKNOWN_ENTITY") {
    const topic = unresolved[0] ?? "that product";
    found = {
      records: [],
      gaps: [{ topic, domain: "SUPPLEMENT", retrievalTags: [topic], reason: "named product is not in the registry; say it cannot be identified; do not invent an identity or a benefit" }],
      open: false,
      outcome: found.outcome,
      request: null,
    };
  }

  const principles = getRecord(PRINCIPLES_ID);
  const unknownOnly = entity.entityStatus === "UNKNOWN_ENTITY";
  const supplementTurn = !unknownOnly && (found.open || found.gaps.length > 0 || found.records.some((record) => record.supplement) || found.outcome?.targetClass === "SUPPLEMENT");
  const scopedPick = !unknownOnly && outcomeScopedPick(found.outcome, found.open);
  const records = unknownOnly
    ? []
    : found.open
      ? [...(principles ? [principles] : []), ...KNOWLEDGE_RECORDS.filter((record) => record.supplement?.baseline)]
      : [...found.records, ...(supplementTurn && principles ? [principles] : [])];

  const asksForEvidence = SOURCE_CUE.some((cue) => hasTerm(folded, cue));
  const reasons: string[] = [];
  let state: KnowledgeResolution["state"] = null;
  if (unknownOnly) {
    state = "KNOWLEDGE_INSUFFICIENT";
    reasons.push("unknown_entity");
  } else if (found.gaps.length > 0) {
    const retrievable = input.canRetrieve && found.gaps.every((gap) => !gap.boundary);
    state = retrievable ? "RETRIEVAL_REQUIRED" : "KNOWLEDGE_INSUFFICIENT";
    reasons.push(retrievable ? "known_gap_retrieve" : found.gaps.some((gap) => gap.boundary) ? "policy_boundary_topic" : "known_gap_no_retrieval");
  } else if (records.length > 0) {
    state = asksForEvidence && input.canRetrieve ? "RETRIEVAL_REQUIRED" : "CANONICAL_KNOWLEDGE_AVAILABLE";
    reasons.push(state === "RETRIEVAL_REQUIRED" ? "source_specificity_requested" : "canonical_covers_topic");
  }
  return {
    state,
    records,
    gaps: found.gaps,
    openSupplementRequest: found.open,
    retrievalReasons: reasons,
    retrievalStatus: "NOT_REQUESTED",
    // On an outcome pick, coverage is about that outcome: the principles alone do not cover "best supplement for focus".
    coverage: scopedPick
      ? (records.some((record) => record.supplement) ? "DIRECT" : "NO_MATCH_IN_SEARCHED_CORPUS")
      : records.length > 0 && found.gaps.length === 0 ? "DIRECT" : "NOT_ASSESSED",
    evidenceConclusion: "UNKNOWN",
    entityStatus: entity.entityStatus,
    unresolvedEntities: entity.unresolvedEntities,
    identityGrounding: identityGroundingOf(identityMatches, entity.entityStatus),
    identityMatches: entity.entityStatus === "UNKNOWN_ENTITY" ? [] : identityMatches,
    requestedOutcome: found.outcome,
    candidateRequest: found.request,
  };
}

/**
 * After retrieval ran. An empty search and a failed search are different:
 * empty → the search finished and found no match; failed → the search did not finish.
 * Neither one means the claim is false or that no evidence exists.
 */
export function settleKnowledgeState(
  resolution: KnowledgeResolution,
  retrievalReturnedEvidence: boolean,
  /** IRRELEVANT = the search ran and returned documents, none about this turn: semantically the same as EMPTY. */
  retrievalRun?: "EMPTY" | "FAILED" | "IRRELEVANT",
  /** Study population of each RELEVANT retrieved document. */
  populations: readonly StudyPopulation[] = [],
): KnowledgeResolution {
  if (resolution.state !== "RETRIEVAL_REQUIRED") return resolution;
  if (retrievalReturnedEvidence) {
    const named = resolution.records.some((record) => record.id !== "supplement-principles");
    const populationApplicability = turnApplicability(populations);
    // Animal or cell evidence alone is background for a human question: it never makes coverage DIRECT.
    const coverage = named && populationApplicability !== "PRECLINICAL_ONLY" ? "DIRECT" : "INDIRECT";
    // H0 WP1: evidence came back but another source failed — keep the evidence AND the failed dependency (PARTIAL).
    return retrievalRun === "FAILED"
      ? { ...resolution, retrievalStatus: "PARTIAL", coverage, populationApplicability, retrievalReasons: [...resolution.retrievalReasons, "retrieval_partial"] }
      : { ...resolution, retrievalStatus: "SUCCESS", coverage, populationApplicability };
  }
  const settled = settleEmpty(resolution, retrievalRun === "FAILED");
  return retrievalRun === "IRRELEVANT" ? { ...settled, retrievalReasons: [...settled.retrievalReasons, "retrieval_no_relevant_hits"] } : settled;
}

function settleEmpty(resolution: KnowledgeResolution, failed: boolean): KnowledgeResolution {
  const namedRecords = resolution.records.filter((record) => record.id !== "supplement-principles");
  const mixed = namedRecords.length > 0 && resolution.gaps.length > 0;
  if (resolution.gaps.length === 0) {
    return {
      ...resolution,
      state: "CANONICAL_KNOWLEDGE_AVAILABLE",
      retrievalStatus: failed ? "FAILED" : "SUCCESS",
      coverage: failed ? "NOT_ASSESSED" : resolution.coverage ?? "DIRECT",
      evidenceConclusion: "UNKNOWN",
      retrievalReasons: [...resolution.retrievalReasons, failed ? "retrieval_failed" : "retrieval_empty_canonical_only"],
    };
  }
  return {
    ...resolution,
    state: "KNOWLEDGE_INSUFFICIENT",
    retrievalStatus: failed ? "FAILED" : mixed ? "PARTIAL" : "SUCCESS",
    coverage: failed ? "NOT_ASSESSED" : mixed ? "DIRECT" : "NO_MATCH_IN_SEARCHED_CORPUS",
    evidenceConclusion: "UNKNOWN",
    retrievalReasons: [...resolution.retrievalReasons, failed ? "retrieval_failed" : "retrieval_empty"],
  };
}

/** Selective retrieval: live external search only when the knowledge layer says canonical knowledge is not enough. */
export function retrievalWarranted(resolution: KnowledgeResolution): boolean {
  if (resolution.entityStatus === "UNKNOWN_ENTITY" || resolution.retrievalReasons.includes("unknown_entity")) return false;
  return resolution.state !== "CANONICAL_KNOWLEDGE_AVAILABLE";
}
