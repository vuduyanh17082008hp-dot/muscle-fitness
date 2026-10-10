import { z } from "zod"

import type { NutritionIntent } from "../coach/conversation"

/**
 * Nutrition Knowledge Brain (N1.6.1) — foundation only.
 *
 * "RAG teaches strategy. Deterministic systems provide exact nutrition truth."
 * Knowledge documents are NEVER the source for calories, macros, portions,
 * prices, logging or allergy validation. Policy documents are NOT retrieval
 * candidates; they are a separate type loaded separately.
 *
 * Future authority hierarchy (not orchestrated here):
 *   1 application safety/policy  2 current user message  3 Athlete State
 *   4 explicit preferences  5 conversation state  6 verified structured food data
 *   7 official brand data  8 MF curated knowledge  9 external retrieval
 *   10 model prior knowledge
 */

export const KNOWLEDGE_CATEGORIES = [
  "principle",
  "goal",
  "diet_style",
  "cuisine",
  "meal_type",
  "craving",
  "food_makeover",
  "flavor_texture",
  "ingredient",
  "special_case",
  "brand",
  "coaching",
] as const
export type NutritionKnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]

export const KNOWLEDGE_AUTHORITIES = ["mf_curated", "structured_database", "official_brand", "policy"] as const
export const KNOWLEDGE_CONFIDENCES = ["curated", "estimated", "external"] as const
export const KNOWLEDGE_RISKS = ["low", "moderate", "high"] as const
export const KNOWLEDGE_LOCALES = ["SG", "global"] as const
export type NutritionKnowledgeLocale = (typeof KNOWLEDGE_LOCALES)[number]

const strList = z.array(z.string().trim().min(1)).optional()
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "updatedAt must be YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(s)), "updatedAt is not a real date")

export const knowledgeMetadataSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/, "id must be dotted lowercase, e.g. nutrition.core.basics"),
    title: z.string().trim().min(1),
    domain: z.literal("nutrition"),
    category: z.enum(KNOWLEDGE_CATEGORIES),
    goals: strList,
    cuisines: strList,
    dietStyles: strList,
    foodTypes: strList,
    sensoryTargets: strList,
    cookingMethods: strList,
    brands: strList,
    tags: z.array(z.string().trim().min(1)).min(1, "at least one tag is required"),
    authority: z.enum(KNOWLEDGE_AUTHORITIES),
    confidence: z.enum(KNOWLEDGE_CONFIDENCES),
    risk: z.enum(KNOWLEDGE_RISKS),
    locale: z.enum(KNOWLEDGE_LOCALES).optional(),
    updatedAt: dateString,
  })
  .strict()
export type NutritionKnowledgeMetadata = z.infer<typeof knowledgeMetadataSchema>

/** Policy documents are application rules, not retrieval material. */
export const policyMetadataSchema = z
  .object({
    id: z.string().regex(/^policy\.[a-z0-9_]+$/, "policy id must look like policy.name"),
    title: z.string().trim().min(1),
    domain: z.literal("nutrition"),
    authority: z.literal("policy"),
    risk: z.enum(KNOWLEDGE_RISKS),
    updatedAt: dateString,
  })
  .strict()
export type NutritionPolicyMetadata = z.infer<typeof policyMetadataSchema>

export type KnowledgeSection = { heading: string; content: string }

export type NutritionKnowledgeDocument = {
  kind: "knowledge"
  metadata: NutritionKnowledgeMetadata
  path: string
  content: string
  sections: KnowledgeSection[]
}

export type NutritionPolicyDocument = {
  kind: "policy"
  metadata: NutritionPolicyMetadata
  path: string
  content: string
  sections: KnowledgeSection[]
}

export type NutritionKnowledgeChunk = {
  /** Deterministic: `<documentId>::<heading-slug>`. */
  id: string
  documentId: string
  heading: string
  content: string
  metadata: NutritionKnowledgeMetadata
}

// ---- Retrieval (N1.6.2) ----------------------------------------------------

export type NutritionKnowledgeAuthority = NutritionKnowledgeMetadata["authority"]
export type NutritionKnowledgeConfidence = NutritionKnowledgeMetadata["confidence"]

export type KnowledgeNeedReason =
  | "STRATEGY"
  | "CRAVING"
  | "CUISINE"
  | "FOOD_MAKEOVER"
  | "FLAVOR_TEXTURE"
  | "COACHING"
  | "GENERAL_NUTRITION"
  | "NOT_NEEDED"

export type KnowledgeNeedDecision = {
  needed: boolean
  reason: KnowledgeNeedReason
  confidence: "HIGH" | "MEDIUM" | "LOW"
  rationale?: string
  /**
   * Layer 1 only: a NOT_NEEDED that is not confident. The message has no deterministic knowledge signal and no
   * deterministic action/lookup shape, but reads as a qualitative or advisory food question, so the bounded
   * semantic gate (Layer 2) may be asked. Never set on a needed=true decision.
   */
  uncertain?: boolean
  /** Which layer decided. Absent = Layer 1. */
  source?: "semantic"
  /** Layer 2 only: closed-vocabulary facets (taste/texture, cuisine, food) used to build the retrieval query. */
  hints?: import("./semantic-hints").SemanticQueryHints
}

export type NutritionKnowledgeQuery = {
  query: string
  intent?: NutritionIntent
  goal?: string
  /** The goal came from the message itself (regex or Layer 2), not just stored state. Only then may a mismatched goal document be demoted. */
  goalStated?: boolean
  locale?: NutritionKnowledgeLocale
  categories?: NutritionKnowledgeCategory[]
  cuisines?: string[]
  foodTypes?: string[]
  sensoryTargets?: string[]
  /** Layer-2 topic terms (canonical corpus words). Scored against a section's OWN heading and body only. */
  conceptTerms?: string[]
  topK?: number
}

/** A chunk plus the internal text/terms retrieval scores against. Never shown to the user. */
export type IndexedKnowledgeChunk = {
  chunk: NutritionKnowledgeChunk
  retrievalText: string
  normalizedTerms: string[]
  /** Terms of the section heading / document title alone, for section-level ranking signals. */
  headingTerms: string[]
  titleTerms: string[]
  /** Terms of this section's own heading + body only: no document title/category/metadata header. */
  localTerms: string[]
}

/** Privacy-safe: ids, counts and category names only — never the raw prompt or Athlete State. */
export type NutritionRetrievalTrace = {
  retrievalTriggered: boolean
  reason: KnowledgeNeedReason
  querySummary: string
  categories: NutritionKnowledgeCategory[]
  candidateCount: number
  filteredCount: number
  selectedChunkIds: string[]
  companionChunkIds: string[]
  primaryChunkCount: number
  totalChunkCount: number
  contextCharacters: number
  latencyMs: number
  fallbackUsed: boolean
  zeroResult: boolean
}

export type NutritionKnowledgeContext = {
  query: NutritionKnowledgeQuery
  chunks: Array<{
    id: string
    title: string
    heading: string
    content: string
    authority: NutritionKnowledgeAuthority
    confidence: NutritionKnowledgeConfidence
    sourceType: "primary" | "companion"
    relevanceScore: number
  }>
  retrievalTrace: NutritionRetrievalTrace
}
