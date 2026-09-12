/**
 * HawkerLens SG shared types (spec Part A).
 *
 * HawkerLens is NOT a generic "photo -> calories" feature — it is a
 * dish-level classifier + component decomposer scoped to a validated
 * MVP list of common Singapore hawker dishes (see dishes.ts). Unknown
 * dishes fall back to the existing generic photo-estimate flow
 * (lib/nutrition/photo-estimate.ts), never to a guessed HawkerLens
 * result.
 */

export type HawkerDishId =
  | "chicken_rice"
  | "cai_png"
  | "nasi_lemak"
  | "laksa"
  | "bak_chor_mee"
  | "ban_mian"
  | "char_kway_teow"
  | "fish_soup"
  | "mee_goreng"
  | "mala";

export const HAWKER_DISH_IDS: HawkerDishId[] = [
  "chicken_rice",
  "cai_png",
  "nasi_lemak",
  "laksa",
  "bak_chor_mee",
  "ban_mian",
  "char_kway_teow",
  "fish_soup",
  "mee_goreng",
  "mala",
];

/* =========================================================
   IMAGE QUALITY (spec §4)
========================================================= */

export type ImageQualityIssue =
  | "poor_visibility"
  | "obstructed"
  | "poor_lighting"
  | "bad_angle"
  | "multiple_plates"
  | "unknown_dish";

export type ImageQualityCheck = {
  usable: boolean;
  issues: ImageQualityIssue[];
  /** 0-1. How usable the image is for estimation, independent of whether a dish was even recognized. */
  qualityScore: number;
  notes: string | null;
};

/* =========================================================
   CLASSIFICATION + SEGMENTATION (spec §5, §6)
========================================================= */

export type DishClassification = {
  dish: HawkerDishId | null;
  confidence: number; // 0-1 — MODEL confidence specifically, see uncertainty.ts
  signals: string[];
};

export type DetectedComponent = {
  name: string;
  /** The VLM's own visual portion judgment, in grams — inherently rough from one photo. */
  visualEstimateGrams: number;
  /** MODEL confidence in identifying + sizing this component specifically. */
  modelConfidence: "high" | "medium" | "low";
  notes?: string;
};

/* =========================================================
   PORTION + NUTRITION (spec §7, §10)
========================================================= */

export type ComponentPortion = {
  name: string;
  estimatedGrams: number;
  gramsLower: number;
  gramsUpper: number;
  /** Combined confidence in the size estimate specifically — see uncertainty.ts for how this differs from nutritionConfidence. */
  portionConfidence: number;
};

export type ComponentNutrition = {
  name: string;
  estimatedGrams: number;
  /** 0-1. Overall confidence in this ONE component's contribution (portion x nutrition-lookup confidence). */
  confidence: number;
  /** The portion.portionConfidence and nutrition-source confidence that were multiplied to get `confidence`, kept separate for uncertainty.ts and the benchmark tooling. */
  portionConfidence: number;
  nutritionSourceConfidence: number;
  calories: { estimate: number; lower: number; upper: number };
  protein: { estimate: number; lower: number; upper: number };
  carbs: { estimate: number; lower: number; upper: number };
  fat: { estimate: number; lower: number; upper: number };
  sourceLabel: string;
  isEstimated: boolean;
};

/* =========================================================
   OUTPUT SCHEMA (spec §11)
========================================================= */

export type NutrientRange = { estimate: number; lower: number; upper: number };

export type HawkerLensResult = {
  status: "ok" | "unknown_dish" | "low_quality_image" | "unconfigured" | "error";
  dish: HawkerDishId | null;
  dishClassification: DishClassification;
  imageQuality: ImageQualityCheck;
  components: Array<{
    name: string;
    estimatedGrams: number;
    confidence: number;
  }>;
  componentDetail: ComponentNutrition[];
  nutrition: {
    calories: NutrientRange;
    protein: NutrientRange;
    carbs: NutrientRange;
    fat: NutrientRange;
  } | null;
  /**
   * Distinguishes the three uncertainty sources internally (spec §8)
   * rather than collapsing them into one number too early.
   */
  uncertainty: {
    modelConfidence: number;
    portionConfidence: number;
    nutritionConfidence: number;
  };
  overallConfidence: number;
  message: string | null;
};
