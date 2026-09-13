import type { HawkerVisionResult } from "@/lib/hawkerlens/vision";

/**
 * HawkerLens DEMO adapter (spec Part "2. HAWKERLENS SG": "If a
 * model/API is unavailable for real inference, build a clearly
 * labelled demo adapter and architecture rather than pretending").
 *
 * This is NOT a fallback that silently substitutes fake data for a
 * real photo — analyze.ts only reaches this when the real vision
 * model isn't configured at all (no GROQ_VISION_MODEL/GROQ_API_KEY),
 * and every result produced from it is stamped `isDemo: true` end to
 * end so the UI can make that unmistakable to the user. It exists so
 * the full pipeline — dish classification → component segmentation →
 * portion estimation → nutrition lookup → uncertainty — can be
 * exercised and demonstrated (local dev, CI, review, a sales demo)
 * without a live vision API key, using a fixed, realistic example
 * rather than fabricating a result for whatever photo was uploaded.
 *
 * The numbers below intentionally match the mission's own worked
 * example (spec Part "3. COMPONENT-LEVEL ESTIMATION": rice ~240g,
 * chicken ~130g, sauce ~20g).
 */
export function getDemoVisionResult(): HawkerVisionResult {
  return {
    imageQuality: {
      usable: true,
      issues: [],
      qualityScore: 1,
      notes: "Demo image — quality check skipped.",
    },
    dishClassification: {
      dish: "chicken_rice",
      confidence: 0.92,
      signals: ["Demo mode: fixed example, not a real classification of the uploaded photo."],
    },
    components: [
      { name: "Hainanese-style oily rice", visualEstimateGrams: 240, modelConfidence: "high" },
      { name: "Poached chicken with skin", visualEstimateGrams: 130, modelConfidence: "high" },
      { name: "Chili sauce", visualEstimateGrams: 20, modelConfidence: "medium" },
    ],
  };
}
