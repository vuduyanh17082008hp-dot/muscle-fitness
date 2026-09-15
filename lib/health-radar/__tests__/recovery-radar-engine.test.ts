import { describe, expect, it } from "vitest";

import { buildRecoveryRadar, type RecoveryRadarInput } from "@/lib/health-radar/recovery-radar-engine";

function series(length: number, value: number): Array<number | null> {
  return Array.from({ length }, () => value);
}

function baseInput(overrides: Partial<RecoveryRadarInput> = {}): RecoveryRadarInput {
  return {
    hrv: { history: series(14, 60), today: 60 },
    restingHr: { history: series(14, 55), today: 55 },
    sleepHours: { history: series(14, 7.5), today: 7.5 },
    recoveryScore: { history: series(14, 78), today: 78 },
    dataSource: { wearable: true, isDemoWearable: true, recoveryCheckins: true },
    ...overrides,
  };
}

describe("buildRecoveryRadar", () => {
  it("reports normal when every signal matches the personal baseline", () => {
    const result = buildRecoveryRadar(baseInput());

    expect(result.decision.status).toBe("normal");
    expect(result.decision.signals.every((s) => s.concerning === "none")).toBe(true);
  });

  it("reports watch for a single moderate deviation (e.g. HRV down ~10ms)", () => {
    const result = buildRecoveryRadar(baseInput({ hrv: { history: series(14, 60), today: 50 } }));

    expect(result.decision.status).toBe("watch");
  });

  it("reports significant_deviation for one severe signal (e.g. HRV down ~20ms)", () => {
    const result = buildRecoveryRadar(baseInput({ hrv: { history: series(14, 60), today: 40 } }));

    expect(result.decision.status).toBe("significant_deviation");
  });

  it("reports significant_deviation when two signals deviate together even if each is only moderate", () => {
    const result = buildRecoveryRadar(
      baseInput({
        hrv: { history: series(14, 60), today: 50 }, // watch-level drop
        restingHr: { history: series(14, 55), today: 60 }, // watch-level rise
      }),
    );

    expect(result.decision.status).toBe("significant_deviation");
  });

  it("the recommendation/why framing never uses diagnostic language — 'unusual recovery pattern', never 'sick' or 'you are ill'", () => {
    const result = buildRecoveryRadar(baseInput({ hrv: { history: series(14, 60), today: 35 } }));
    const framingText = [result.recommendation, ...result.why].join(" ").toLowerCase();

    expect(framingText).toContain("unusual recovery pattern");
    expect(framingText).not.toContain("sick");
    expect(framingText).not.toContain("diagnos");
    expect(framingText).not.toContain("disease");
  });

  it("explicitly disclaims diagnosis in its limitations (the one place 'diagnose' should appear — in the negative)", () => {
    const result = buildRecoveryRadar(baseInput({ hrv: { history: series(14, 60), today: 35 } }));

    expect(result.limitations?.some((l) => l.toLowerCase().includes("cannot diagnose"))).toBe(true);
  });

  it("always includes a limitation stating this is not a medical assessment", () => {
    const result = buildRecoveryRadar(baseInput());

    expect(result.limitations?.some((l) => l.toLowerCase().includes("not a medical assessment"))).toBe(true);
  });

  it("degrades honestly with insufficient history — low confidence, status stays normal (never fabricated)", () => {
    const result = buildRecoveryRadar(
      baseInput({
        hrv: { history: [null, null], today: 40 },
        restingHr: { history: [null, null], today: 60 },
        sleepHours: { history: [null, null], today: 5 },
        recoveryScore: { history: [null, null], today: 50 },
      }),
    );

    expect(result.decision.status).toBe("normal");
    expect(result.confidence).toBe("low");
    expect(result.limitations?.some((l) => l.includes("don't have enough history"))).toBe(true);
  });

  it("notes when HRV/RHR are unavailable because no wearable is connected", () => {
    const result = buildRecoveryRadar(
      baseInput({
        hrv: { history: [], today: null },
        restingHr: { history: [], today: null },
        dataSource: { wearable: false, isDemoWearable: false, recoveryCheckins: true },
      }),
    );

    expect(result.limitations?.some((l) => l.toLowerCase().includes("no wearable is connected"))).toBe(true);
  });

  it("labels demo wearable data honestly in its limitations", () => {
    const result = buildRecoveryRadar(baseInput({ dataSource: { wearable: true, isDemoWearable: true, recoveryCheckins: true } }));

    expect(result.limitations?.some((l) => l.toLowerCase().includes("demo wearable"))).toBe(true);
  });

  it("describes resting-HR rises as above baseline (never 'below' when HR went up)", () => {
    const result = buildRecoveryRadar(
      baseInput({
        restingHr: { history: series(14, 55), today: 64 },
      }),
    );

    const resting = result.decision.signals.find((s) => s.name === "resting_hr");
    expect(resting?.direction).toBe("worse");
    expect(result.why.some((line) => line.includes("Resting heart rate") && line.includes("above"))).toBe(true);
    expect(result.why.some((line) => line.includes("Resting heart rate") && line.includes("below"))).toBe(false);
  });

  it("treats HRV null today with history as unknown, not a fabricated drop", () => {
    const result = buildRecoveryRadar(
      baseInput({
        hrv: { history: series(14, 60), today: null },
      }),
    );

    const hrv = result.decision.signals.find((s) => s.name === "hrv");
    expect(hrv?.concerning).toBe("none");
    expect(hrv?.direction).toBe("unknown");
    expect(hrv?.deviation.delta).toBeNull();
  });

  it("stays normal when only sleep is available and matches baseline", () => {
    const result = buildRecoveryRadar(
      baseInput({
        hrv: { history: [], today: null },
        restingHr: { history: [], today: null },
        sleepHours: { history: series(14, 7.5), today: 7.5 },
        recoveryScore: { history: [], today: null },
        dataSource: { wearable: false, isDemoWearable: false, recoveryCheckins: true },
      }),
    );

    expect(result.decision.status).toBe("normal");
  });

  it("flags conflicting multi-signal stress (low sleep + low HRV) as significant_deviation", () => {
    const result = buildRecoveryRadar(
      baseInput({
        hrv: { history: series(14, 60), today: 40 },
        sleepHours: { history: series(14, 7.5), today: 5 },
      }),
    );

    expect(result.decision.status).toBe("significant_deviation");
  });
});
