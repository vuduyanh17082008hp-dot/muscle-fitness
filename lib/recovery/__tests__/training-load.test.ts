import { describe, expect, it } from "vitest";
import { computeTrainingLoad, type RecentSessionRow } from "@/lib/recovery/training-load";

/**
 * Covers the schema-drift repair's training-load requirements
 * directly: the underlying bug was `workout_sessions.session_rpe`
 * not existing on the live database, which would make ANY session
 * row selected with that column throw before ever reaching this
 * function. These tests instead verify the function itself — which
 * already assumed `session_rpe` could be `null` — behaves correctly
 * both when it's present and when it's missing, so the fix (adding
 * the column) has a real function to feed once the query succeeds.
 */

function session(overrides: Partial<RecentSessionRow> = {}): RecentSessionRow {
  return {
    completed_at: new Date().toISOString(),
    session_rpe: null,
    total_volume_kg: null,
    ...overrides,
  };
}

describe("computeTrainingLoad — with session RPE present (Test 10)", () => {
  it("factors a high average RPE into a red/amber state alongside low recovery", () => {
    const sessions: RecentSessionRow[] = Array.from({ length: 5 }, () =>
      session({ session_rpe: 9, total_volume_kg: 5000 }),
    );

    const result = computeTrainingLoad(sessions, 40);

    expect(result.averageSessionRpe).toBe(9);
    expect(result.state).toBe("red");
  });

  it("reports the correct average RPE and total volume across sessions", () => {
    const sessions: RecentSessionRow[] = [
      session({ session_rpe: 7, total_volume_kg: 4000 }),
      session({ session_rpe: 8, total_volume_kg: 4500 }),
    ];

    const result = computeTrainingLoad(sessions, 80);

    expect(result.averageSessionRpe).toBe(7.5);
    expect(result.totalVolumeKgLast7Days).toBe(8500);
  });
});

describe("computeTrainingLoad — session RPE null/missing (Test 11)", () => {
  it("never crashes when every session has session_rpe: null", () => {
    const sessions: RecentSessionRow[] = Array.from({ length: 3 }, () =>
      session({ session_rpe: null, total_volume_kg: 3000 }),
    );

    expect(() => computeTrainingLoad(sessions, 60)).not.toThrow();
  });

  it("reports averageSessionRpe as null rather than fabricating a value", () => {
    const sessions: RecentSessionRow[] = [
      session({ session_rpe: null }),
      session({ session_rpe: null }),
    ];

    const result = computeTrainingLoad(sessions, 70);

    expect(result.averageSessionRpe).toBeNull();
  });

  it("still classifies training load using session count/rest days when RPE is entirely unavailable", () => {
    const sessions: RecentSessionRow[] = Array.from({ length: 6 }, (_, i) =>
      session({
        session_rpe: null,
        completed_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
      }),
    );

    const result = computeTrainingLoad(sessions, 40);

    // 6 sessions in 7 days with no rest day + low recovery -> not "green".
    expect(result.state).not.toBe("green");
    expect(result.sessionsLast7Days).toBe(6);
  });

  it("degrades to green with an explanatory reason when there is no recovery check-in at all", () => {
    const result = computeTrainingLoad([session({ session_rpe: null })], null);

    expect(result.state).toBe("green");
    expect(result.reason).toContain("recovery check-in");
  });

  it("handles a completely empty session list without crashing", () => {
    const result = computeTrainingLoad([], 75);

    expect(result.sessionsLast7Days).toBe(0);
    expect(result.averageSessionRpe).toBeNull();
    expect(result.totalVolumeKgLast7Days).toBeNull();
    expect(result.lastSessionDaysAgo).toBeNull();
  });
});
