import { describe, expect, it } from "vitest";
import { evaluateTrend } from "@/lib/dante-core/trend-engine";
import type { PerformanceDataPoint } from "@/lib/training/performance";
import type { SetVisionTrendPoint } from "@/lib/dante-core/types";

function points(values: number[], startDate = "2026-01-01"): PerformanceDataPoint[] {
  const base = new Date(startDate);
  return values.map((estimated1RmKg, i) => {
    const date = new Date(base);
    date.setDate(date.getDate() + i * 7);
    return { date: date.toISOString().slice(0, 10), estimated1RmKg };
  });
}

describe("evaluateTrend", () => {
  it("delegates the core classification to classifyPerformanceTrend unchanged", () => {
    const result = evaluateTrend(points([100, 100, 100, 100]));
    expect(result.trend).toBe("stable");
  });

  it("returns insufficient_data with fewer than 3 points and no SetVision note", () => {
    const result = evaluateTrend(points([100, 102]));
    expect(result.trend).toBe("insufficient_data");
    expect(result.setVisionNote).toBeNull();
  });

  it("notes agreement when velocity loss trends upward alongside a declining e1RM trend", () => {
    const setVisionPoints: SetVisionTrendPoint[] = [
      { date: "2026-01-01", velocityLoss: 0.1, romConsistency: 0.9 },
      { date: "2026-01-08", velocityLoss: 0.12, romConsistency: 0.9 },
      { date: "2026-01-15", velocityLoss: 0.28, romConsistency: 0.85 },
      { date: "2026-01-22", velocityLoss: 0.3, romConsistency: 0.85 },
    ];

    const result = evaluateTrend(points([100, 95, 88, 80]), setVisionPoints);

    expect(result.trend).toBe("declining");
    expect(result.setVisionNote).toContain("consistent with the declining");
  });

  it("says there isn't enough SetVision data when too few points are calibrated", () => {
    const result = evaluateTrend(points([100, 95, 88]), [
      { date: "2026-01-01", velocityLoss: 0.1, romConsistency: 0.9 },
    ]);

    expect(result.setVisionNote).toContain("Not enough SetVision sessions");
  });

  it("returns null setVisionNote when no SetVision history is supplied", () => {
    const result = evaluateTrend(points([100, 105, 110]));
    expect(result.setVisionNote).toBeNull();
  });
});
