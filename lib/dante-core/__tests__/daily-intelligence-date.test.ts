import { describe, expect, it } from "vitest";

import {
  getOrBuildDailyIntelligence,
  resolveDailyIntelligenceDay,
} from "@/lib/dante-core/daily-intelligence";
import { localDayRangeUtc, localDateTimeParts } from "@/lib/training/load-today-session";

const CROSSING_MIDNIGHT = new Date("2026-10-06T16:30:00.000Z");
const SAME_DATE = new Date("2026-10-06T08:00:00.000Z");

function cacheClient(options: {
  timezone: string | null;
  onSummaryDate?: (date: string) => void;
}) {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: options.timezone ? { timezone: options.timezone } : null,
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "dante_daily_intelligence") {
        return {
          select: () => ({
            eq: () => ({
              eq: (_: string, summaryDate: string) => {
                options.onSummaryDate?.(summaryDate);
                return {
                  maybeSingle: async () => ({
                    data: {
                      summary_date: summaryDate,
                      readiness_score: 70,
                      training_focus: "Upper",
                      nutrition_adherence_percent: 80,
                      recovery_status: "ready",
                      narrative: "cached",
                      generated_at: "2026-10-06T00:00:00.000Z",
                    },
                    error: null,
                  }),
                };
              },
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe("resolveDailyIntelligenceDay", () => {
  it("uses Asia/Singapore local date after UTC midnight", () => {
    const day = resolveDailyIntelligenceDay(CROSSING_MIDNIGHT, "Asia/Singapore");
    expect(day.localDate).toBe("2026-10-07");
    expect(localDateTimeParts(CROSSING_MIDNIGHT, "Asia/Singapore").localDate).toBe("2026-10-07");
    expect(day).toMatchObject(localDayRangeUtc(CROSSING_MIDNIGHT, "Asia/Singapore"));
  });

  it("keeps the same local date when Singapore and UTC share the calendar day", () => {
    const day = resolveDailyIntelligenceDay(SAME_DATE, "Asia/Singapore");
    expect(day.localDate).toBe("2026-10-06");
    expect(localDateTimeParts(SAME_DATE, "UTC").localDate).toBe("2026-10-06");
  });

  it("falls back to UTC when no profile timezone is available", () => {
    const day = resolveDailyIntelligenceDay(CROSSING_MIDNIGHT, "UTC");
    expect(day.localDate).toBe("2026-10-06");
  });
});

describe("getOrBuildDailyIntelligence cache key", () => {
  it("reads the Singapore local date after UTC midnight", async () => {
    let summaryDate = "";
    const intelligence = await getOrBuildDailyIntelligence(
      cacheClient({
        timezone: "Asia/Singapore",
        onSummaryDate: (date) => {
          summaryDate = date;
        },
      }) as never,
      "user-1",
      { now: CROSSING_MIDNIGHT },
    );
    expect(summaryDate).toBe("2026-10-07");
    expect(intelligence.summaryDate).toBe("2026-10-07");
  });

  it("keys the cache on UTC when the profile timezone is missing", async () => {
    let summaryDate = "";
    await getOrBuildDailyIntelligence(
      cacheClient({
        timezone: null,
        onSummaryDate: (date) => {
          summaryDate = date;
        },
      }) as never,
      "user-1",
      { now: CROSSING_MIDNIGHT },
    );
    expect(summaryDate).toBe("2026-10-06");
  });
});
