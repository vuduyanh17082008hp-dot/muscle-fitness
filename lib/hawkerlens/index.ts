/**
 * HawkerLens SG public API (spec Part A).
 */

export { analyzeHawkerLensPhoto } from "@/lib/hawkerlens/analyze";
export { isHawkerLensConfigured } from "@/lib/hawkerlens/vision";
export { DISH_TEMPLATES, getDishTemplate, findDishByAlias } from "@/lib/hawkerlens/dishes";
export { matchComponentTemplate } from "@/lib/hawkerlens/component-matching";
export { estimateComponentPortion } from "@/lib/hawkerlens/portion";
export { lookupComponentNutrition } from "@/lib/hawkerlens/nutrition-lookup";
export { aggregateNutrition, computeUncertainty } from "@/lib/hawkerlens/uncertainty";
export {
  compareDishClassification,
  buildConfusionMatrix,
  compareSegmentation,
  comparePortion,
  compareCalories,
  compareProtein,
  computeCalibration,
  summarizeHawkerLensBenchmark,
} from "@/lib/hawkerlens/benchmark/compare";

export type {
  HawkerDishId,
  HawkerLensResult,
  DishClassification,
  DetectedComponent,
  ComponentPortion,
  ComponentNutrition,
  ImageQualityCheck,
  ImageQualityIssue,
  NutrientRange,
} from "@/lib/hawkerlens/types";
export { HAWKER_DISH_IDS } from "@/lib/hawkerlens/types";
export type { DishTemplate, DishComponentTemplate } from "@/lib/hawkerlens/dishes";
export type {
  HawkerGroundTruthAnnotation,
  HawkerLensBenchmarkSummary,
  BenchmarkEntry,
} from "@/lib/hawkerlens/benchmark/types";
