import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadExperimentObservations } = vi.hoisted(() => ({
  loadExperimentObservations: vi.fn(async () => []),
}));

vi.mock("@/lib/experiments/load-daily-series", () => ({
  loadExperimentObservations,
}));

import { buildExperimentResultFor } from "@/lib/experiments/build-experiment-result";
import type { ExperimentRecord } from "@/lib/experiments/mutations";

const experiment: ExperimentRecord = {
  id: "experiment-1",
  question: "Does late caffeine affect my sleep?",
  exposureType: "late_caffeine",
  outcomeType: "sleep_hours",
  windowDays: 7,
  status: "active",
  createdAt: "2026-10-01T00:00:00.000Z",
};

describe("buildExperimentResultFor date window", () => {
  beforeEach(() => {
    loadExperimentObservations.mockClear();
  });

  it("uses the profile-local calendar date at Singapore's UTC boundary", async () => {
    await buildExperimentResultFor(
      {} as never,
      "user-1",
      experiment,
      new Date("2026-10-06T16:30:00.000Z"),
      "Asia/Singapore",
    );

    expect(loadExperimentObservations).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({
        startDate: "2026-09-30",
        endDate: "2026-10-07",
        timeZone: "Asia/Singapore",
      }),
    );
  });

  it("keeps the UTC calendar date for UTC profiles", async () => {
    await buildExperimentResultFor(
      {} as never,
      "user-1",
      experiment,
      new Date("2026-10-06T16:30:00.000Z"),
      "UTC",
    );

    expect(loadExperimentObservations).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({
        startDate: "2026-09-29",
        endDate: "2026-10-06",
        timeZone: "UTC",
      }),
    );
  });
});
