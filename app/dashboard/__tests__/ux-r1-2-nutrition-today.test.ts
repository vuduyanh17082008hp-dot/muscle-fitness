import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * UX-R1.2 Nutrition Today: Today is the logging screen (summary, meals, Add food, coach); planning moved to
 * /dashboard/nutrition/plan; Add food opens on search with the other sources underneath; rows say where their
 * numbers came from and keep 44px edit/delete targets.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { NutritionTracker } from "@/components/nutrition/nutrition-tracker";
import type { FoodLogEntry } from "@/lib/nutrition/food-log/types";
import { todayIso } from "@/lib/nutrition/date-utils";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

const entry = (patch: Partial<FoodLogEntry>): FoodLogEntry =>
  ({
    id: "row-1", logDate: todayIso(), mealType: "lunch", foodName: "Chicken breast", brand: null,
    source: "usda", sourceId: "171077", barcode: null, quantityGrams: 150, servingName: null, servingsConsumed: null,
    calories: 248, proteinG: 46.5, carbsG: 0, fatG: 5.4, fiberG: null, isEstimated: false,
    ...patch,
  }) as FoodLogEntry;

function renderTracker(entries: FoodLogEntry[], unavailable = false) {
  return renderToStaticMarkup(
    createElement(NutritionTracker, {
      userId: "u1",
      initialEntries: entries,
      initialDate: todayIso(),
      initialUnavailable: unavailable,
      target: { calories: 2400, protein: 160, carbs: 260, fat: 70 },
    }),
  );
}

describe("Nutrition Today holds only logging", () => {
  it("the Today page renders the tracker and coach, and none of the planning sections", () => {
    const today = read("app/dashboard/nutrition/page.tsx");
    expect(today).toContain("<NutritionTracker");
    expect(today).toContain("<NutritionCoachPanel");
    for (const moved of ["BudgetPlanner", "NutritionSettingsForm", "Gram-Based Meal Plan", "Energy Model", "Calibration"]) {
      expect(today).not.toContain(moved);
    }
  });

  it("the plan route keeps every planning section, and its settings actions revalidate it", () => {
    const plan = read("app/dashboard/nutrition/plan/page.tsx");
    for (const kept of ["<NutritionSettingsForm", "<BudgetPlanner", "Gram-Based Meal Plan", "Energy Model", 'id="macros"', "Calibration", "Nutrition Data Sources", "Health Note"]) {
      expect(plan).toContain(kept);
    }
    expect(read("app/dashboard/nutrition/actions.ts").match(/revalidatePath\("\/dashboard\/nutrition\/plan"\)/g)).toHaveLength(3); // settings, budget, weight/calibration
    expect(read("app/dashboard/nutrition/tabs.ts")).toContain('href: "/dashboard/nutrition/plan"');
  });
});

describe("Add food is search-first", () => {
  const modal = read("components/nutrition/track-food-modal.tsx");

  it("opens on search and returns to search from every other source", () => {
    expect(modal).toContain('useState<Mode>("search")');
    expect(modal).not.toContain('"menu"');
    expect(modal).toContain("moreOptions={<OtherSources");
  });

  it("keeps every other source one tap away", () => {
    for (const mode of ["barcode", "photo", "hawkerlens", "dish", "menu_photo", "manual"]) {
      expect(modal).toContain(`{ mode: "${mode}"`);
    }
  });

  it("keeps editable fields at 16px on phones (app-wide, so the sheet is covered)", () => {
    expect(read("app/globals.css")).toMatch(/@media \(max-width: 639px\) \{\s*:is\(input[^{]+\{\s*font-size: 16px;/);
  });
});

describe("Food log rows", () => {
  it("labels verified, estimated and user-entered values differently", () => {
    const html = renderTracker([
      entry({ id: "a" }),
      entry({ id: "b", foodName: "Chicken rice", source: "ai_estimate", isEstimated: true }),
      entry({ id: "c", foodName: "Homemade soup", source: "user_provided" }),
    ]);
    expect(html.match(/Verified source/g)).toHaveLength(1);
    expect(html.match(/>Estimate</g)).toHaveLength(1);
    expect(html).toContain("Entered manually");
  });

  it("edit and delete are 44px targets", () => {
    const html = renderTracker([entry({})]);
    expect(html).toMatch(/aria-label="Edit portion of Chicken breast" class="grid size-11/);
    expect(html).toMatch(/aria-label="Delete Chicken breast" class="grid size-11/);
  });

  it("an unreadable day shows unknown totals, never zero", () => {
    const html = renderTracker([], true);
    expect(html).toContain("Unavailable — log not loaded");
    expect(html).not.toContain("2400 kcal left");
  });

  it("a serving edit keeps its serving name; the tracker still announces every log change", () => {
    const tracker = read("components/nutrition/nutrition-tracker.tsx");
    expect(tracker).toContain("{ quantityGrams: grams, servingName: serving.name, servingsConsumed: amount }");
    expect(tracker).toMatch(/window\.dispatchEvent\(new Event\(FOOD_LOG_CHANGED_EVENT\)\)/);
  });
});
