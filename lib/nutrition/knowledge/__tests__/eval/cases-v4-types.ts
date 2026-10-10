import type { NutritionTopic } from "../../../coach/conversation"
import type { KnowledgeNeedReason } from "../../types"
import { DOC, GENERIC_DOCS } from "./cases-v3-types"

/**
 * nutrition-retrieval-eval-v4 (N1.6.3-R3) — shared schema. No labels live here.
 *
 * Built to stress what R1/R2 left open: gate misses, indirect intent, low lexical overlap, Vietnamese and mixed
 * Vietnamese-English, goal strategy, polysemy, cuisine context without a cuisine document, multi-document needs and
 * sibling-section ranking. Cases are stored fully expanded (no defaults at evaluation time). Document ids are corpus ids
 * without the "nutrition." prefix; section ids are `<doc>::<heading-slug>` as produced by parse.ts.
 */
export const EVAL_VERSION_V4 = "nutrition-retrieval-eval-v4"

export { DOC, GENERIC_DOCS }

export type V4Language = "en" | "vi" | "mixed"
export type V4Difficulty = "easy" | "medium" | "hard"
export type V4Domain = "texture" | "flavor" | "craving" | "makeover" | "cuisine" | "goal_strategy" | "principles" | "coaching" | "negative"
export type V4FailureClass =
  | "INDIRECT_INTENT" | "LOW_OVERLAP" | "VIETNAMESE" | "MIXED_LANGUAGE" | "GOAL_STRATEGY" | "POLYSEMY" | "CUISINE_CONTEXT"
  | "CRAVING_SENSORY" | "MULTI_DOCUMENT" | "SIBLING_SECTION" | "FOLLOW_UP" | "NEGATIVE_NEAR_MISS"
/** Observable query facet the built retrieval query should (requiredConcepts) or must not (forbiddenConcepts) carry. */
export type V4Concept = `${"sensory" | "cuisine" | "food" | "goal"}:${string}`

export type V4Case = {
  id: string
  split: "dev" | "heldout"
  message: string
  language: V4Language
  domain: V4Domain
  difficulty: V4Difficulty
  failureClass: V4FailureClass[]
  /** Nearby intents that must resolve differently share a contrast group. */
  contrastGroup?: string
  /** Should the Knowledge Need Gate fire? */
  expectedKnowledgeNeed: boolean
  /** Gate reasons that are a correct reading (intent-extraction diagnostic; the oracle gate uses the first). */
  expectedReasons?: KnowledgeNeedReason[]
  /** Each listed document is required. */
  expectedDocumentIds?: string[]
  /** One of these is required (several documents are legitimately correct). */
  anyOfDocumentIds?: string[]
  /** Fine alongside the required documents; anything else in the top 3 chunks is a wrong document. */
  acceptableDocumentIds?: string[]
  /** Explicit distractors. */
  unacceptableDocumentIds?: string[]
  /** false = document-only case: section ranking is not meaningful and is not scored. */
  sectionEvaluation: boolean
  /** Primary target section(s). */
  expectedSectionIds?: string[]
  /** Semantically equivalent alternatives that also count as a section hit. */
  acceptableSectionIds?: string[]
  /** Also useful but not a hit; measured only by sibling survival. */
  alsoUsefulSectionIds?: string[]
  requiredConcepts?: V4Concept[]
  forbiddenConcepts?: V4Concept[]
  multiDocument: boolean
  siblingSensitive: boolean
  /** N1.5 conversation topic passed to buildKnowledgeQuery for a short follow-up. */
  topic?: NutritionTopic
  /** Athlete State goal the runtime would pass (the message may override it). */
  athleteGoal: "fat_loss" | "muscle_gain" | null
}

export const REASONS_BY_DOMAIN_V4: Record<Exclude<V4Domain, "negative">, KnowledgeNeedReason[]> = {
  texture: ["FLAVOR_TEXTURE", "CRAVING", "FOOD_MAKEOVER"],
  flavor: ["FLAVOR_TEXTURE", "CRAVING", "FOOD_MAKEOVER"],
  craving: ["CRAVING", "FOOD_MAKEOVER", "FLAVOR_TEXTURE"],
  makeover: ["FOOD_MAKEOVER", "CRAVING", "FLAVOR_TEXTURE", "STRATEGY"],
  cuisine: ["CUISINE", "STRATEGY"],
  goal_strategy: ["STRATEGY", "GENERAL_NUTRITION"],
  principles: ["GENERAL_NUTRITION", "STRATEGY", "COACHING"],
  coaching: ["COACHING", "CRAVING", "GENERAL_NUTRITION", "STRATEGY"],
}

const DERIVED: Partial<Record<V4Domain, V4FailureClass>> = { texture: "CRAVING_SENSORY", flavor: "CRAVING_SENSORY", craving: "CRAVING_SENSORY", cuisine: "CUISINE_CONTEXT", goal_strategy: "GOAL_STRATEGY" }

export type PosOptsV4 = {
  lang?: V4Language
  diff?: V4Difficulty
  fc?: V4FailureClass[]
  cg?: string
  reasons?: KnowledgeNeedReason[]
  docs?: string[]
  any?: string[]
  acc?: string[]
  unacc?: string[]
  /** Omit for a document-only case. */
  sec?: string[]
  accSec?: string[]
  useful?: string[]
  req?: V4Concept[]
  forbid?: V4Concept[]
  sib?: boolean
  topic?: NutritionTopic
  goal?: "fat_loss" | "muscle_gain" | null
}

const splitOf = (id: string): V4Case["split"] => (id.startsWith("h4-") ? "heldout" : "dev")
const uniq = <T>(xs: T[]) => [...new Set(xs)]

function classes(domain: V4Domain, lang: V4Language, o: { fc?: V4FailureClass[]; multi?: boolean; sib?: boolean; topic?: NutritionTopic }): V4FailureClass[] {
  return uniq([
    ...(o.fc ?? []),
    ...(DERIVED[domain] ? [DERIVED[domain]!] : []),
    ...(lang === "vi" ? (["VIETNAMESE"] as const) : lang === "mixed" ? (["MIXED_LANGUAGE"] as const) : []),
    ...(o.multi ? (["MULTI_DOCUMENT"] as const) : []),
    ...(o.sib ? (["SIBLING_SECTION"] as const) : []),
    ...(o.topic ? (["FOLLOW_UP"] as const) : []),
  ])
}

/**
 * Positive builder. With neither `docs` nor `any`, the required document is the target section's document.
 * Generic docs (core.basics, coaching.*) are acceptable secondary context unless required or unacceptable.
 */
export function pos(id: string, message: string, domain: Exclude<V4Domain, "negative">, opts: PosOptsV4): V4Case {
  const o = opts.docs || opts.any ? opts : { ...opts, docs: uniq((opts.sec ?? []).map((x) => x.split("::")[0])) }
  const lang = o.lang ?? "en"
  const required = new Set([...(o.docs ?? []), ...(o.any ?? [])])
  const unacc = new Set(o.unacc ?? [])
  const multi = (o.docs?.length ?? 0) + (o.any?.length ? 1 : 0) >= 2
  return {
    id,
    split: splitOf(id),
    message,
    language: lang,
    domain,
    difficulty: o.diff ?? "medium",
    failureClass: classes(domain, lang, { fc: o.fc, multi, sib: o.sib, topic: o.topic }),
    ...(o.cg ? { contrastGroup: o.cg } : {}),
    expectedKnowledgeNeed: true,
    expectedReasons: o.reasons ?? REASONS_BY_DOMAIN_V4[domain],
    ...(o.docs?.length ? { expectedDocumentIds: o.docs } : {}),
    ...(o.any?.length ? { anyOfDocumentIds: o.any } : {}),
    acceptableDocumentIds: uniq([...(o.acc ?? []), ...GENERIC_DOCS]).filter((d) => !required.has(d) && !unacc.has(d)),
    ...(o.unacc?.length ? { unacceptableDocumentIds: o.unacc } : {}),
    sectionEvaluation: !!o.sec?.length,
    ...(o.sec?.length ? { expectedSectionIds: o.sec } : {}),
    ...(o.accSec?.length ? { acceptableSectionIds: o.accSec } : {}),
    ...(o.useful?.length ? { alsoUsefulSectionIds: o.useful } : {}),
    ...(o.req?.length ? { requiredConcepts: o.req } : {}),
    ...(o.forbid?.length ? { forbiddenConcepts: o.forbid } : {}),
    multiDocument: multi,
    siblingSensitive: !!o.sib,
    ...(o.topic ? { topic: o.topic } : {}),
    athleteGoal: o.goal === undefined ? "fat_loss" : o.goal,
  }
}

export function neg(id: string, message: string, o: { lang?: V4Language; diff?: V4Difficulty; cg?: string; nearMiss?: boolean; topic?: NutritionTopic } = {}): V4Case {
  const lang = o.lang ?? "en"
  return {
    id,
    split: splitOf(id),
    message,
    language: lang,
    domain: "negative",
    difficulty: o.diff ?? "medium",
    failureClass: classes("negative", lang, { fc: o.nearMiss ? ["NEGATIVE_NEAR_MISS"] : [], topic: o.topic }),
    ...(o.cg ? { contrastGroup: o.cg } : {}),
    expectedKnowledgeNeed: false,
    sectionEvaluation: false,
    multiDocument: false,
    siblingSensitive: false,
    ...(o.topic ? { topic: o.topic } : {}),
    athleteGoal: "fat_loss",
  }
}

export const s = (doc: string, slug: string) => `${doc}::${slug}`
