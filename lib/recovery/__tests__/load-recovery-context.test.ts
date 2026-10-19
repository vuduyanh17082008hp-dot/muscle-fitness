import { afterEach, expect, it, vi } from "vitest";
import { loadRecoveryContext } from "../load-recovery-context";
import type { RecoveryCheckinRow } from "../types";

afterEach(() => vi.useRealTimers());

async function loadAt(nowIso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(nowIso));
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
  return loadRecoveryContext(client as unknown as Parameters<typeof loadRecoveryContext>[0], "owner");
}

it("uses local today and calendar windows, excluding sparse old and future check-ins", async () => {
  const result = await loadAt("2026-09-14T17:00:00Z");
  expect(result.today?.checkin_date).toBe("2026-09-15");
  expect(result.averages7Days).toMatchObject({ score: 90, sampleSize: 2 });
  expect(result.averages30Days).toMatchObject({ score: 66.7, sampleSize: 3 });
  expect(result.trend30Days.map((point) => point.date)).toEqual(["2026-08-20", "2026-09-10", "2026-09-15"]);
});

it("PF-04: today's check-in is CURRENT for the local calendar day", async () => {
  const result = await loadAt("2026-09-14T17:00:00Z"); // 2026-09-15 in Asia/Singapore
  expect(result.current).toMatchObject({ status: "CURRENT", recordedDate: "2026-09-15", localDate: "2026-09-15", provenance: "VERIFIED_CHECKIN" });
  expect(result.current.score).toBe(result.todayScoreResult.score);
});

it("PF-04: with no check-in today, yesterday's score is STALE with its date and never today's score", async () => {
  const result = await loadAt("2026-09-16T17:00:00Z"); // 2026-09-17 locally; latest row is 2026-09-16
  expect(result.today).toBeNull();
  expect(result.todayScoreResult.score).toBeNull();
  expect(result.current).toEqual({ status: "STALE", score: 0, recordedDate: "2026-09-16", localDate: "2026-09-17", provenance: "VERIFIED_CHECKIN" });
});

it("PF-04: no check-in in the window is MISSING", async () => {
  const result = await loadAt("2027-03-01T00:00:00Z");
  expect(result.current).toMatchObject({ status: "MISSING", score: null, recordedDate: null });
});
