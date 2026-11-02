import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { EXERCISE_CATALOGUE } from "@/lib/workouts/exercise-library";
import { CAPABILITY_TEXT, EXERCISE_OPTIONS, customSelection } from "@/lib/setvision/exercise-selection";

/**
 * Catalogue coverage: every catalogue exercise is selectable and has an analysis path
 * (tracked engine → tracked + AI review; no engine → AI review). Accessibility only —
 * not a claim that any of them is accurately measured. Set SETVISION_COVERAGE_OUT to
 * also write the report as JSON.
 */
describe("SetVision catalogue coverage report", () => {
  it("zero catalogue exercises without a reachable review path", () => {
    const rows = EXERCISE_CATALOGUE.map((e) => {
      const option = EXERCISE_OPTIONS.find((o) => o.key === `catalogue:${e.slug}`) ?? null;
      return {
        slug: e.slug ?? null,
        name: e.name,
        muscle: e.primaryMuscle,
        equipment: (e as { equipment?: unknown }).equipment ?? null,
        selectable: option !== null,
        capability: option ? CAPABILITY_TEXT[option.capability].badge : null,
        tracked: Boolean(option?.engine),
        aiReview: option !== null, // every selection can request an AI visual review
        noTrackingReason: option?.manualReason ?? null,
      };
    });
    const byMuscle: Record<string, { total: number; tracked: number; aiReviewOnly: number }> = {};
    for (const r of rows) {
      const g = (byMuscle[r.muscle] ??= { total: 0, tracked: 0, aiReviewOnly: 0 });
      g.total += 1;
      if (r.tracked) g.tracked += 1;
      else g.aiReviewOnly += 1;
    }
    const report = {
      catalogueExercises: rows.length,
      selectableOptions: EXERCISE_OPTIONS.length,
      withReviewPath: rows.filter((r) => r.selectable && r.aiReview).length,
      trackedSupported: rows.filter((r) => r.tracked).length,
      aiReviewOnly: rows.filter((r) => !r.tracked).length,
      deadEnds: rows.filter((r) => !r.selectable || !r.aiReview).map((r) => r.name),
      customNames: customSelection("Barbell Shrug").capability === "MANUAL_REVIEW_SUPPORTED" ? "AI visual review" : "none",
      byMuscle,
      rows,
    };
    if (process.env.SETVISION_COVERAGE_OUT) writeFileSync(process.env.SETVISION_COVERAGE_OUT, JSON.stringify(report, null, 2));
    expect(report.deadEnds).toEqual([]);
    expect(report.withReviewPath).toBe(report.catalogueExercises);
  });
});
