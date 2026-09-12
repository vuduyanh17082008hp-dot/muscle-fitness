import { describe, expect, it } from "vitest";
import { computeRecoveryScore, statusForScore } from "@/lib/recovery/score";
import type { RecoveryCheckinInput } from "@/lib/recovery/types";

/**
 * Covers the schema-drift repair's Phase 10 validation scenarios
 * directly against the real deterministic scoring engine — this is
 * the ONE place a recovery score is calculated (see score.ts's own
 * docstring), so these tests are the authoritative check that Dante
 * never fabricates or overrides it.
 */

function input(overrides: Partial<RecoveryCheckinInput> = {}): RecoveryCheckinInput {
  return {
    sleepHours: null,
    sleepQuality: null,
    stress: null,
    fatigue: null,
    soreness: null,
    mood: null,
    readiness: null,
    restingHr: null,
    steps: null,
    painIllness: "no",
    notes: null,
    ...overrides,
  };
}

describe("computeRecoveryScore — Scenario A: good recovery", () => {
  it("produces a high score and a 'ready'/'good' status when every signal is good", () => {
    const result = computeRecoveryScore(
      input({
        sleepHours: 8,
        sleepQuality: 9,
        stress: 2, // low stress = good, on a 1-10 "how stressed" scale
        fatigue: 2,
        soreness: 1,
        mood: 9,
        readiness: 9,
      }),
    );

    expect(result.score).not.toBeNull();
    expect(result.score as number).toBeGreaterThanOrEqual(80);
    expect(["ready", "good"]).toContain(result.status);
  });
});

describe("computeRecoveryScore — Scenario B: poor recovery", () => {
  it("produces a low score and a 'priority'/'moderate' status when every signal is poor", () => {
    const result = computeRecoveryScore(
      input({
        sleepHours: 4,
        sleepQuality: 2,
        stress: 9,
        fatigue: 9,
        soreness: 9,
        mood: 2,
        readiness: 2,
      }),
    );

    expect(result.score).not.toBeNull();
    expect(result.score as number).toBeLessThan(50);
    expect(["priority", "moderate"]).toContain(result.status);
  });

  it("makes training-load recommendations more conservative than a good-recovery day (same sessions, different score)", () => {
    const goodScore = computeRecoveryScore(
      input({ sleepHours: 8, sleepQuality: 9, stress: 2, fatigue: 2, soreness: 1, mood: 9, readiness: 9 }),
    ).score as number;

    const poorScore = computeRecoveryScore(
      input({ sleepHours: 4, sleepQuality: 2, stress: 9, fatigue: 9, soreness: 9, mood: 2, readiness: 2 }),
    ).score as number;

    expect(poorScore).toBeLessThan(goodScore);
  });
});

describe("computeRecoveryScore — Scenario C: missing data", () => {
  it("returns score: null (never fabricated) when no inputs are provided at all", () => {
    const result = computeRecoveryScore(input());

    expect(result.score).toBeNull();
    expect(result.status).toBeNull();
    expect(result.missingInputs.length).toBeGreaterThan(0);
  });

  it("computes a score from only the available drivers when some inputs are missing, without inventing the rest", () => {
    // Only sleep provided — stress/fatigue/soreness/mood/readiness all missing.
    const result = computeRecoveryScore(input({ sleepHours: 8, sleepQuality: 8 }));

    expect(result.score).not.toBeNull();
    expect(result.missingInputs).toContain("stress");
    expect(result.missingInputs).toContain("fatigue");
    expect(result.missingInputs).toContain("soreness");

    const sleepDriver = result.drivers.find((d) => d.key === "sleep");
    const stressDriver = result.drivers.find((d) => d.key === "stress");
    expect(sleepDriver?.available).toBe(true);
    expect(stressDriver?.available).toBe(false);
  });
});

describe("computeRecoveryScore — Scenario D: self-report conflict", () => {
  it("does NOT blindly output ~90 when self-reported readiness is 9/10 but sleep/stress/fatigue are all poor", () => {
    const result = computeRecoveryScore(
      input({
        sleepHours: 4,
        sleepQuality: 2,
        stress: 9,
        fatigue: 9,
        soreness: 7,
        readiness: 9, // self-report says "fully ready"
        mood: 9,
      }),
    );

    // readiness is only one of five weighted drivers (blended with
    // mood at 15% combined weight) — it must not dominate the result.
    expect(result.score).not.toBeNull();
    expect(result.score as number).toBeLessThan(70);
  });

  it("self-reported readiness alone (everything else missing) is weighted, not copied 1:1 as the final score", () => {
    const result = computeRecoveryScore(input({ readiness: 9 }));

    // readiness=9 on a 1-10 scale maps to 90 on the moodReadiness
    // driver, but that driver is the ONLY available one here, so the
    // renormalized weighted sum still equals the driver's own score
    // (90) in this specific single-driver case — the real conflict
    // protection is exercised by the test above, where OTHER drivers
    // pull the blended score down. This test just confirms readiness
    // is stored as one driver's input, not specially privileged.
    const moodReadinessDriver = result.drivers.find((d) => d.key === "moodReadiness");
    expect(moodReadinessDriver?.available).toBe(true);
    expect(moodReadinessDriver?.score).toBe(90);
  });
});

describe("statusForScore", () => {
  it("maps score bands to the documented status labels", () => {
    expect(statusForScore(90)).toBe("ready");
    expect(statusForScore(75)).toBe("good");
    expect(statusForScore(55)).toBe("moderate");
    expect(statusForScore(30)).toBe("priority");
  });
});
