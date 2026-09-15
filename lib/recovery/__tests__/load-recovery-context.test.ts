import { afterEach, expect, it, vi } from "vitest";
import { loadRecoveryContext } from "../load-recovery-context";
import type { RecoveryCheckinRow } from "../types";

afterEach(() => vi.useRealTimers());

it("uses local today and calendar windows, excluding sparse old and future check-ins", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T17:00:00Z"));
  function row(date: string, score: number): RecoveryCheckinRow {
    return {
      id: date, user_id: "owner", checkin_date: date, recovery_score: score,
      sleep_hours: 8, sleep_quality: null, stress: null, fatigue: null, soreness: null,
      mood: null, readiness: null, resting_hr: null, steps: null, pain_illness: "no",
      notes: null, score_breakdown: null, created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z`,
    };
  }
  const rows = [row("2026-09-15", 100), row("2026-09-10", 80), row("2026-08-20", 20), row("2026-07-01", 0), row("2026-09-16", 0)];
  const client = {
    from(table: string) {
      if (table === "profiles") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: "Asia/Singapore" } }) }) }) };
      let start = "", end = "9999", owner = "";
      const query = {
        select() { return query; },
        eq(column: string, value: string) { if (column === "user_id") owner = value; return query; },
        gte(_column: string, value: string) { start = value; return query; },
        lte(_column: string, value: string) { end = value; return query; },
        order() { return query; },
        async limit() { return { data: table === "recovery_checkins" ? rows.filter((r) => r.user_id === owner && r.checkin_date >= start && r.checkin_date <= end) : [], error: null }; },
      };
      return query;
    },
  };
  const result = await loadRecoveryContext(client as unknown as Parameters<typeof loadRecoveryContext>[0], "owner");
  expect(result.today?.checkin_date).toBe("2026-09-15");
  expect(result.averages7Days).toMatchObject({ score: 90, sampleSize: 2 });
  expect(result.averages30Days).toMatchObject({ score: 66.7, sampleSize: 3 });
  expect(result.trend30Days.map((point) => point.date)).toEqual(["2026-08-20", "2026-09-10", "2026-09-15"]);
});
