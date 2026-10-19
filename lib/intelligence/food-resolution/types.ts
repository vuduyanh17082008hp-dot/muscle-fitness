/**
 * Shared food resolution — pure types. One resolver serves Gemma (owner) and Dante (read-only fact access).
 * Missing means missing: a nutrient the source did not report is `null`, never 0.
 */

export type FoodStatus = "VERIFIED" | "ESTIMATED" | "UNRESOLVED" | "AMBIGUOUS";
export type FoodSourceTag = "LOCAL_CANONICAL" | "USDA_FDC" | "NONE";
export type FoodBasis = "raw" | "cooked" | "prepared" | "packaged" | "unknown";
export type UsdaStatus = "OK" | "NOT_CONFIGURED" | "NO_RESULT" | "SKIPPED";

export interface FoodNutrients {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber?: number | null;
  sugar?: number | null;
  sodiumMg?: number | null;
}

/** A candidate from any source, already normalized at the adapter boundary. */
export interface FoodCandidate {
  id: string;
  name: string;
  basis: FoodBasis;
  per100g: FoodNutrients;
  /** "high" for USDA Foundation / SR Legacy records. */
  confidence?: "high" | "medium" | "low" | "fallback";
  brand?: string | null;
}

export interface LocalFoodHit extends FoodCandidate {
  /** The curated table marks some entries ESTIMATED (brand/cut dependent). */
  verification: "VERIFIED" | "ESTIMATED";
}

export interface ResolveRequest {
  /** The phrase as understood, English: "atlantic cod", "salmon". */
  text: string;
  /** Generic base without variety ("cod"). Defaults to `text`. */
  base?: string;
  /** Preparation the user asked for ("raw" | "cooked" | a method like "grilled"). */
  preparation?: string;
  /** Grams the answer will be scaled to, if any. Only used to decide whether raw/cooked ambiguity matters. */
  quantityGrams?: number | null;
  /**
   * Follow-up on a food already resolved this conversation: the raw/cooked basis of that record. Same query, same ranking
   * inputs, so the same record is selected again and its basis is never re-asked or silently swapped. A stated `preparation` wins.
   */
  referenceBasis?: "raw" | "cooked";
}

export interface ResolverDeps {
  searchLocal: (base: string) => LocalFoodHit | null;
  searchUsda: (query: string) => Promise<{ foods: FoodCandidate[]; configured: boolean }>;
  now?: () => number;
}

export interface FoodResolutionDiagnostics {
  LOCAL_LOOKUP: { hit: boolean; latencyMs: number };
  USDA_LOOKUP: { status: UsdaStatus; candidates: number; latencyMs: number };
}

export interface ResolvedFood {
  status: FoodStatus;
  source: FoodSourceTag;
  /** Human-readable food name from the source; null when unresolved. */
  name: string | null;
  basis: FoodBasis;
  per100g: FoodNutrients | null;
  sourceId?: string;
  attribution?: string;
  /** Machine-readable reasons (selection, degradation, mismatch). No raw user text. */
  reasons: string[];
  /** Present when raw vs cooked changes the answer materially and the user did not say which. */
  clarification?: { field: "preparation"; options: string[] };
  diagnostics: FoodResolutionDiagnostics;
}
