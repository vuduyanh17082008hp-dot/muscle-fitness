import { describe, expect, it } from "vitest";
import { aggregateNutrition, computeUncertainty } from "@/lib/hawkerlens/uncertainty";
import type { ComponentNutrition, DishClassification } from "@/lib/hawkerlens/types";

function component(overrides: Partial<ComponentNutrition> = {}): ComponentNutrition {
  return {
    name: "rice",
    estimatedGrams: 200,
    confidence: 0.6,
    portionConfidence: 0.8,
    nutritionSourceConfidence: 0.6,
    calories: { estimate: 260, lower: 220, upper: 300 },
    protein: { estimate: 5, lower: 4, upper: 6 },
    carbs: { estimate: 60, lower: 50, upper: 70 },
    fat: { estimate: 6, lower: 5, upper: 7 },
    sourceLabel: "test",
    isEstimated: true,
    ...overrides,
  };
}

describe("aggregateNutrition", () => {
  it("sums per-component ranges into a total range", () => {
    const result = aggregateNutrition([
      component(),
      component({
        calories: { estimate: 100, lower: 80, upper: 120 },
        protein: { estimate: 20, lower: 18, upper: 22 },
      }),
    ]);

    expect(result.calories).toEqual({ estimate: 360, lower: 300, upper: 420 });
    expect(result.protein.estimate).toBe(25);
  });

  it("returns zeroed ranges for an empty component list", () => {
    const result = aggregateNutrition([]);
    expect(result.calories).toEqual({ estimate: 0, lower: 0, upper: 0 });
  });
});

describe("computeUncertainty", () => {
  const dishClassification: DishClassification = { dish: "chicken_rice", confidence: 0.9, signals: [] };

  it("distinguishes model/portion/nutrition confidence rather than collapsing them", () => {
    const result = computeUncertainty(dishClassification, [
      component({ portionConfidence: 0.9, nutritionSourceConfidence: 0.9 }),
    ]);

    expect(result.modelConfidence).toBe(0.9);
    expect(result.portionConfidence).toBe(0.9);
    expect(result.nutritionConfidence).toBe(0.9);
  });

  it("produces a lower overall confidence when the dish classification itself is uncertain", () => {
    const confidentDish = computeUncertainty(
      { dish: "chicken_rice", confidence: 0.95, signals: [] },
      [component({ portionConfidence: 0.8, nutritionSourceConfidence: 0.8 })],
    );

    const uncertainDish = computeUncertainty(
      { dish: "chicken_rice", confidence: 0.3, signals: [] },
      [component({ portionConfidence: 0.8, nutritionSourceConfidence: 0.8 })],
    );

    expect(uncertainDish.overallConfidence).toBeLessThan(confidentDish.overallConfidence);
  });

  it("handles zero components without dividing by zero", () => {
    const result = computeUncertainty(dishClassification, []);
    expect(result.portionConfidence).toBe(0);
    expect(result.nutritionConfidence).toBe(0);
    expect(Number.isFinite(result.overallConfidence)).toBe(true);
  });
});
