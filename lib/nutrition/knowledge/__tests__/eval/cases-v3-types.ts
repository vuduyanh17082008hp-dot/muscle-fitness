import type { NutritionIntent, NutritionTopic } from "../../../coach/conversation"
import type { KnowledgeNeedReason } from "../../types"

/**
 * nutrition-retrieval-eval-v3 — shared schema (no labels live here).
 *
 * Cases are stored FULLY EXPANDED: no defaults are applied at evaluation time, so the repo dev file and the sealed
 * held-out JSON are judged by exactly the same rules. Document ids are corpus ids without the "nutrition." prefix;
 * section ids are `<doc>::<heading-slug>` as produced by parse.ts (companion-only headings are never valid targets).
 */
/**
 * v3.0 (2026-10-10, 219 rows): frozen, baseline-only, never used for tuning.
 * v3.1 (2026-10-10): v3.0 rows unchanged + a hypothesis-probe block (pre-tuning hypotheses A-D) + option-selection/revert negatives.
 */
export const EVAL_VERSION_V3 = "nutrition-retrieval-eval-v3.1"

export const DOC = {
  TX: "flavor_texture.texture_hacks",
  FH: "flavor_texture.flavor_hacks",
  VN: "cuisine.vietnamese",
  HK: "cuisine.singapore_hawker",
  CC: "craving.cereal",
  IC: "craving.ice_cream",
  MC: "food_makeovers.cereal",
  FF: "food_makeovers.fast_food",
  FC: "food_makeovers.fried_chicken",
  FL: "goal.fat_loss",
  MG: "goal.muscle_gain",
  CB: "core.basics",
  UP: "core.uncertainty_provenance",
  CS: "coaching.coaching_style",
  CV: "coaching.craving_conversation",
} as const
export type DocId = (typeof DOC)[keyof typeof DOC]

/** Broad docs that are fine as SECONDARY context on most positives (same convention as v1/v2); they must not displace the specific doc. */
export const GENERIC_DOCS: readonly string[] = [DOC.CB, DOC.CV, DOC.CS]

export type V3Lang = "en" | "vi" | "mixed"
export type V3Style = "direct" | "indirect" | "conversational" | "slang" | "fragment" | "messy" | "followup" | "paraphrase"
export type V3Domain =
  | "texture" | "flavor" | "craving_cereal" | "craving_ice_cream" | "craving_general"
  | "makeover_fried_chicken" | "makeover_fast_food" | "makeover_cereal"
  | "cuisine_vietnamese" | "cuisine_hawker" | "cuisine_mixed"
  | "fat_loss" | "muscle_gain" | "coaching" | "principles" | "uncertainty" | "negative"
export type V3Contrast =
  | "CRUNCH_VS_CREAMINESS" | "CRUNCH_VS_CRISPNESS" | "SWEET_VS_SAVORY" | "CRAVING_VS_MACRO_LOOKUP"
  | "CUISINE_VS_FOOD_ENTITY" | "GENERIC_VS_SPECIFIC_MAKEOVER" | "HAWKER_VS_VIETNAMESE"
  | "FAT_LOSS_VS_GENERAL" | "MAKEOVER_VS_SIMPLE_EDIT" | "LANGUAGE_VS_CUISINE"
  | "SIBLING_SECTIONS" | "DIVERSITY_HELP" | "METADATA_VS_LOCAL" | "CANONICAL_COLLAPSE"
export type V3Trap = "generic-doc" | "section-metadata"
/**
 * Pre-tuning hypotheses the probe block is designed to validate or falsify (labels describe the corpus, not a fix):
 * A_DIVERSITY_KEEP — a second sibling section is genuinely useful and should survive selection;
 * A_DIVERSITY_HELP — two different documents are both required;
 * B_METADATA_BROADCAST — only section-local heading/body evidence separates the gold section from its siblings;
 * C_LEXICAL_EVIDENCE — terse, indirect, one-incidental-word or out-of-vocabulary phrasing;
 * D_CANONICALISATION — the original wording matters more than the shared canonical concept (crisp vs crunch, hot weather vs spicy).
 */
export type V3Hypothesis = "A_DIVERSITY_KEEP" | "A_DIVERSITY_HELP" | "B_METADATA_BROADCAST" | "C_LEXICAL_EVIDENCE" | "D_CANONICALISATION"

export type V3Case = {
  id: string
  split: "dev" | "heldout"
  message: string
  lang: V3Lang
  style: V3Style
  domain: V3Domain
  /** Should the Knowledge Need Gate fire (Layer 1 + Layer 2)? */
  mustRetrieve: boolean
  /** Gate reasons that are a correct reading of the message (informational metric; never required). */
  expectedCategory?: KnowledgeNeedReason[]
  /** Each listed doc must appear among the first k distinct retrieved documents. */
  mandatoryDocs?: string[]
  /** At least one of these must appear (used when several documents are legitimately correct). */
  anyOfDocs?: string[]
  /** Fine alongside the required docs. Anything not required/acceptable in the top 3 chunks is a wrong document. */
  acceptableDocs?: string[]
  /** Explicit distractors: retrieving these is a contrast failure, not just filler. */
  unacceptableDocs?: string[]
  /** Correct target sections; any one counts. */
  sections?: string[]
  /** Also-useful sections (not gold): never count as a section hit, measured only by sibling survival. */
  siblingSections?: string[]
  contrast?: V3Contrast
  trap?: V3Trap
  hypotheses?: V3Hypothesis[]
  /** N1.5 conversation topic the runtime would pass to buildKnowledgeQuery for a short follow-up. */
  topic?: NutritionTopic
  intent?: NutritionIntent
}

export const REASONS_BY_DOMAIN: Record<Exclude<V3Domain, "negative">, KnowledgeNeedReason[]> = {
  texture: ["FLAVOR_TEXTURE", "CRAVING", "FOOD_MAKEOVER"],
  flavor: ["FLAVOR_TEXTURE", "CRAVING", "FOOD_MAKEOVER"],
  craving_cereal: ["CRAVING", "FOOD_MAKEOVER", "FLAVOR_TEXTURE"],
  craving_ice_cream: ["CRAVING", "FOOD_MAKEOVER", "FLAVOR_TEXTURE"],
  craving_general: ["CRAVING", "FLAVOR_TEXTURE"],
  makeover_fried_chicken: ["FOOD_MAKEOVER", "CRAVING", "FLAVOR_TEXTURE", "STRATEGY"],
  makeover_fast_food: ["FOOD_MAKEOVER", "CRAVING", "STRATEGY"],
  makeover_cereal: ["FOOD_MAKEOVER", "CRAVING", "STRATEGY"],
  cuisine_vietnamese: ["CUISINE"],
  cuisine_hawker: ["CUISINE"],
  cuisine_mixed: ["CUISINE"],
  fat_loss: ["STRATEGY", "GENERAL_NUTRITION", "COACHING"],
  muscle_gain: ["STRATEGY", "GENERAL_NUTRITION"],
  coaching: ["COACHING", "GENERAL_NUTRITION", "STRATEGY"],
  principles: ["GENERAL_NUTRITION", "STRATEGY"],
  uncertainty: ["GENERAL_NUTRITION", "STRATEGY"],
}

type PosOpts = {
  lang?: V3Lang
  style?: V3Style
  docs?: string[]
  any?: string[]
  acc?: string[]
  unacc?: string[]
  sec?: string[]
  sib?: string[]
  contrast?: V3Contrast
  trap?: V3Trap
  topic?: NutritionTopic
  reasons?: KnowledgeNeedReason[]
  hyp?: V3Hypothesis[]
}

const splitOf = (id: string): V3Case["split"] => (id.startsWith("h3-") ? "heldout" : "dev")

/** Positive builder: expands the generic-secondary convention so the stored case is self-describing. */
export function pos(id: string, message: string, domain: Exclude<V3Domain, "negative">, o: PosOpts): V3Case {
  const required = new Set([...(o.docs ?? []), ...(o.any ?? [])])
  const unacc = new Set(o.unacc ?? [])
  return {
    id,
    split: splitOf(id),
    message,
    lang: o.lang ?? "en",
    style: o.style ?? "direct",
    domain,
    mustRetrieve: true,
    expectedCategory: o.reasons ?? REASONS_BY_DOMAIN[domain],
    ...(o.docs?.length ? { mandatoryDocs: o.docs } : {}),
    ...(o.any?.length ? { anyOfDocs: o.any } : {}),
    acceptableDocs: [...new Set([...(o.acc ?? []), ...GENERIC_DOCS])].filter((d) => !required.has(d) && !unacc.has(d)),
    ...(o.unacc?.length ? { unacceptableDocs: o.unacc } : {}),
    ...(o.sec?.length ? { sections: o.sec } : {}),
    ...(o.sib?.length ? { siblingSections: o.sib } : {}),
    ...(o.contrast ? { contrast: o.contrast } : {}),
    ...(o.trap ? { trap: o.trap } : {}),
    ...(o.topic ? { topic: o.topic } : {}),
    ...(o.hyp?.length ? { hypotheses: o.hyp } : {}),
  }
}

export function neg(id: string, message: string, o: { lang?: V3Lang; style?: V3Style; contrast?: V3Contrast } = {}): V3Case {
  return { id, split: splitOf(id), message, lang: o.lang ?? "en", style: o.style ?? "direct", domain: "negative", mustRetrieve: false, ...(o.contrast ? { contrast: o.contrast } : {}) }
}

/** Section id helper. */
export const s = (doc: string, slug: string) => `${doc}::${slug}`
