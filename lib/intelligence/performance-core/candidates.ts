import { fold, hasTerm, tokens } from "./text";
import type { Candidate, CandidateDecision, CandidateRequest, DecisionTask, RankingCriterion } from "./types";

/**
 * Candidate decisions: "rank creatine, whey, BCAA…", "should I buy zinc or a multivitamin", "what can I skip".
 * Text only — parsing the request and checking that an answer accounts for every candidate. Priority is policy's
 * (policy.ts::decideCandidates); entity binding is the registry's, passed in so this file imports nothing from it.
 *
 *   REQUESTED_CANDIDATES = EVALUATED_CANDIDATES = RENDERED_CANDIDATES, unless one is excluded with a reason.
 *
 * ponytail: a lexical list parser (separators + a task verb), not a grammar. Upgrade path: the QueryFrame entity list.
 */

const RANK_VERB = /(?<![a-z])(?:rank\w*|prioriti[sz]\w*|tier list)(?![a-z])/;
const PRIORITY = /(?<![a-z])(?:priority|priorities|which (?:one|of (?:these|them|those)) (?:first|is most|matters most)|most (?:important|worth it))(?![a-z])/;
const SKIP = /(?<![a-z])(?:skip\w*|least (?:necessary|needed|important|useful)|cut first|can i drop)(?![a-z])/;
const BUY = /(?<![a-z])(?:buy\w*|purchas\w*|shopping|add to (?:my )?cart)(?![a-z])/;
const WORTH = /(?<![a-z])worth (?:it|buying|the money|taking|getting)(?![a-z])/;
// "these" / "them" after the verb points back to a list given before it.
const BACK_REFERENCE = /(?<![a-z])(?:rank\w*|prioriti[sz]\w*|sort|order)\s+(?:these|them|those|this list|all of (?:these|them|those))(?![a-z])/;
const EXACT_ORDER = /(?<![a-z])(?:exact (?:best )?order|best order|from 1 to \d+|1 ?(?:to|-|–) ?\d+|in exact order|number (?:them|these) (?:from|1))(?![a-z])/;
const TASK_CUE = new RegExp(`${RANK_VERB.source}|${EXACT_ORDER.source}|${SKIP.source}|${BUY.source}|${WORTH.source}|${PRIORITY.source}`);
const ANTI_WASTE = /(?<![a-z])(?:waste\w*|(?:don'?t|dont|do not) (?:really )?need|unnecessary|least necessary|skip\w*|not (?:really )?needed)(?![a-z])/;
const PERSONAL = /(?<![a-z])(?:for me|for my(?:self)?|should i|do i (?:really )?need|me personally|in my case|my (?:diet|goal|situation|budget))(?![a-z])/;
// Where a list ends: the criterion, a condition, or a sibling request.
const LIST_END = /\s(?:for|by|as|based on|in terms of|if|when|because|since|so|but|from|given|considering)\s|\s(?:and|then) (?:tell|show|give|log|what|how|also)\s|[?.!:;]|\s-\s|$/;
const CRITERION = /(?<![a-z])(?:for|by|as|based on|in terms of)\s+((?:[a-z0-9'-]+\s*){1,6}?)\s*(?:[?.!,;]|$|\s(?:and|but|if|so|because|then|when)\s)/;
const CRITERION_FILLER = new Set(["me", "my", "myself", "the", "a", "an", "what", "which", "is", "i", "personally", "you"]);
const ITEM_FILLER = /^(?:a|an|the|some|maybe|like|also|either|plus|then|just|any)\s+/;
// H0 cluster G: "…and dầu cá giúp mình" — a trailing request filler is not part of the product name.
const TRAILING_FILLER = /(?:\s+(?:giup minh|giup toi|cho minh|cho toi|nhe|nha|voi|please|pls|for me|thanks))+$/;
// A word no product, exercise or food name contains: an item holding one is prose, not a candidate.
const NOT_A_NAME = new Set(["i", "im", "i'm", "my", "me", "you", "your", "it", "this", "that", "these", "them", "those", "right", "now", "maybe", "some", "thing", "things", "stuff", "supp", "supps", "supplement", "supplements", "really", "need", "want", "scared", "might", "can", "could", "should", "would", "will", "just", "is", "are", "be", "do", "get", "one", "ones", "what", "which"]);
const HYPERTROPHY = /hypertroph|muscle (?:growth|gain|mass|size|building)|(?:chest|back|leg|arm|glute|shoulder|quad|lat)s? (?:growth|size|development)|(?<![a-z])(?:size|mass|gains|bulk\w*|grow\w*)(?![a-z])/;
const PERFORMANCE = /(?<![a-z])(?:performance|strength|power|endurance|athletic\w*|stronger|explosive\w*)(?![a-z])/;
const GENERAL_HEALTH = /(?<![a-z])(?:general health|overall health|health|healthy|longevity|wellness|wellbeing|well-being)(?![a-z])/;

/** The criterion's words, minus "for me" filler. */
function criterionPhraseOf(text: string): string | null {
  const words = text.match(CRITERION)?.[1]?.trim().split(/\s+/).filter((word) => !CRITERION_FILLER.has(word));
  return words?.length ? words.join(" ") : null;
}

function criterionOf(folded: string, phrase: string | null, personal: boolean): RankingCriterion {
  if (/least (?:necessary|needed|important|useful)|skip first|cut first|what (?:can|should) i skip/.test(folded)) return "LEAST_NECESSARY";
  if (phrase && BUY.test(phrase)) return "PURCHASE";
  if (phrase && HYPERTROPHY.test(phrase)) return "HYPERTROPHY";
  if (phrase && PERFORMANCE.test(phrase)) return "PERFORMANCE";
  if (phrase && GENERAL_HEALTH.test(phrase)) return "GENERAL_HEALTH";
  if (phrase) return "OUTCOME";
  if (BUY.test(folded)) return "PURCHASE";
  return personal ? "PERSONAL" : "UNSPECIFIED";
}

function taskOf(folded: string): DecisionTask | null {
  if (RANK_VERB.test(folded) || EXACT_ORDER.test(folded)) return "RANK";
  if (SKIP.test(folded)) return "SKIP";
  if (BUY.test(folded)) return "BUY";
  if (WORTH.test(folded)) return "WORTH_IT";
  if (PRIORITY.test(folded)) return "RANK";
  return null;
}

/** The span holding the list: before "rank these", after a colon, or after the task verb up to the criterion. */
function listRegion(folded: string): string {
  const back = folded.match(BACK_REFERENCE);
  if (back && back.index !== undefined) {
    const after = folded.slice(back.index + back[0].length);
    const colon = after.indexOf(":");
    if (colon >= 0) return after.slice(colon + 1);
    return folded.slice(0, back.index).split(/[.?!]\s/).at(-1) ?? "";
  }
  const verb = folded.match(TASK_CUE);
  if (!verb || verb.index === undefined) return "";
  const rest = folded.slice(verb.index + verb[0].length);
  const colon = rest.match(/^[^.?!]{0,40}?:\s*/);
  const body = colon ? rest.slice(colon[0].length) : rest;
  const end = body.search(LIST_END);
  return end >= 0 ? body.slice(0, end) : body;
}

/** A label's surface forms: as written, hyphen/space swapped, last word singular ("potatoes" → "potato") and plural. */
function surfaceTerms(label: string): string[] {
  const words = label.split(" ");
  const last = words.at(-1) ?? "";
  const singular = /(?:oes|ches|shes|sses)$/.test(last) ? last.slice(0, -2) : last.length > 3 && last.endsWith("s") && !last.endsWith("ss") ? last.slice(0, -1) : last;
  const plural = /(?:s|x|z|ch|sh)$/.test(last) ? `${label}es` : `${label}s`;
  const forms = [label, label.replace(/-/g, " "), label.replace(/ /g, "-"), [...words.slice(0, -1), singular].join(" "), plural];
  return [...new Set(forms.filter((form) => form.length >= 2))];
}

export type EntityBinder = (foldedLabel: string) => { topic: string; aliases?: string[] } | null;

/**
 * "rank creatine, whey and bcaa for me" → RANK × [creatine, whey, bcaa] × PERSONAL. null when the turn asks for no
 * decision over options. A list needs two or more items; with fewer, the named registry entities are the candidates
 * ("should omega 3 be high priority for me"). A buy / skip turn with nothing named keeps an empty list.
 */
export function parseCandidateRequest(message: string, bind: EntityBinder, named: Array<{ topic: string; aliases?: string[] }> = []): CandidateRequest | null {
  const folded = fold(message);
  const task = taskOf(folded);
  if (!task) return null;
  const items = listRegion(folded)
    .split(/\s*(?:,|;|\/|&|\+|\bor\b|\band\b|\bvs\.?|\bversus\b|\bplus\b)\s*/)
    .map((item) => item.replace(/[^a-z0-9' -]/g, " ").replace(/\s+/g, " ").replace(/^[\s-]+|[\s-]+$/g, "").replace(ITEM_FILLER, "").replace(TRAILING_FILLER, "").trim())
    .filter((item) => item.length >= 2 && tokens(item).length <= 4 && !tokens(item).some((word) => NOT_A_NAME.has(word)));
  const listed = items.length >= 2;
  const raw = listed ? items : named.map((entity) => entity.topic);
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const label of raw) {
    const entity = listed ? bind(label) : named.find((entry) => entry.topic === label) ?? null;
    const key = entity?.topic ?? label;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ label, ...(entity ? { entity: entity.topic } : {}), terms: [...new Set([...surfaceTerms(label), ...(entity?.aliases ?? []), ...(entity ? [fold(entity.topic)] : [])])] });
  }
  // A priority / worth question with nothing named is not a candidate decision; a purchase with nothing named is.
  if (candidates.length === 0 && task !== "BUY" && task !== "SKIP") return null;
  const personal = PERSONAL.test(folded);
  const phrase = criterionPhraseOf(listed ? folded.slice(Math.max(0, folded.indexOf(items.at(-1)!))) : folded);
  return {
    task,
    candidates,
    // One named option ("should omega 3 be high priority?") can only be judged for the person asking.
    criterion: criterionOf(folded, phrase, personal || candidates.length === 1),
    criterionPhrase: phrase,
    personal,
    antiWaste: ANTI_WASTE.test(folded),
    exactOrderRequested: EXACT_ORDER.test(folded),
  };
}

/** Which requested candidates the reply names. Deterministic: the model is never trusted to have remembered the list. */
export function candidateCompleteness(reply: string, decision: CandidateDecision | null | undefined): { requested: number; rendered: number; missing: string[] } {
  const candidates = decision?.request.candidates ?? [];
  const folded = fold(reply);
  const missing = candidates.filter((candidate) => !candidate.terms.some((term) => hasTerm(folded, term))).map((candidate) => candidate.label);
  return { requested: candidates.length, rendered: candidates.length - missing.length, missing };
}
