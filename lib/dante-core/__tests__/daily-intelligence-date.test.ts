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
  /** Today's live workout_sessions rows (the cached row says training_focus "Upper"). */
  sessions?: Array<{ name: string; session_state: string | null }>;
  narrative?: string;
}) {
  return {
    from(table: string) {
      if (table === "workout_sessions") {
        const result = { data: options.sessions ?? [{ name: "Upper", session_state: "not_started" }], error: null };
        const chain = { eq: () => chain, gte: () => chain, lte: () => chain, order: () => chain, limit: async () => result };
        return { select: () => chain };
      }

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
                      narrative: options.narrative ?? "cached",
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

describe("FINAL-F F-03: cached Daily Brief narrative follows the live session state", () => {
  const cachedProceed = "Performance conditions are favorable. Proceed with today's planned Upper session.";

  it("a session completed after the narrative was cached drops the training focus and the 'proceed' line", async () => {
    const intelligence = await getOrBuildDailyIntelligence(
      cacheClient({ timezone: "UTC", sessions: [{ name: "Upper", session_state: "completed" }], narrative: cachedProceed }) as never,
      "user-1",
      { now: SAME_DATE },
    );
    expect(intelligence.trainingFocus).toBeNull();
    expect(intelligence.narrative).toBe("Performance conditions are favorable.");
  });

  it("a cancelled session is not a training focus either", async () => {
    const intelligence = await getOrBuildDailyIntelligence(
      cacheClient({ timezone: "UTC", sessions: [{ name: "Upper", session_state: "cancelled" }], narrative: cachedProceed }) as never,
      "user-1",
      { now: SAME_DATE },
    );
    expect(intelligence.narrative).not.toMatch(/proceed|session/i);
  });

  it("an unchanged open session keeps the cached phrasing", async () => {
    const intelligence = await getOrBuildDailyIntelligence(
      cacheClient({ timezone: "UTC", sessions: [{ name: "Upper", session_state: "in_progress" }], narrative: cachedProceed }) as never,
      "user-1",
      { now: SAME_DATE },
    );
    expect(intelligence.trainingFocus).toBe("Upper");
    expect(intelligence.narrative).toBe(cachedProceed);
  });

  it("with a completed morning session and an open evening one, the open one is the focus", async () => {
    const intelligence = await getOrBuildDailyIntelligence(
      cacheClient({ timezone: "UTC", sessions: [{ name: "Lower", session_state: "completed" }, { name: "Upper", session_state: "not_started" }] }) as never,
      "user-1",
      { now: SAME_DATE },
    );
    expect(intelligence.trainingFocus).toBe("Upper");
  });
});
