import { describe, expect, it } from "vitest";
import {
  deriveObservationsFromHistory,
  evaluateRiskSignals,
  normalizeBodyRegion,
  observeFromUserMessage,
} from "@/lib/dante-core/risk-accumulator";
import type { RiskRawObservation } from "@/lib/dante-core/risk-accumulator/types";

describe("risk integrity — timestamps + laterality", () => {
  it("A: real timestamps day 1 + day 6 same right shoulder → ELEVATED", () => {
    const now = new Date("2026-09-07T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      [
        { content: "right shoulder irritated overhead", observedAt: "2026-09-01T12:00:00.000Z" },
        { content: "right shoulder feels off overhead again", observedAt: "2026-09-07T12:00:00.000Z" },
      ],
      { now },
    );
    const result = evaluateRiskSignals(observations, { now });
    expect(result.signals.find((item) => item.type === "REPEATED_IRRITATION")).toMatchObject({
      bodyRegion: "RIGHT_SHOULDER",
      level: "ELEVATED",
      observationCount: 2,
    });
  });

  it("B: real timestamps day 1 + day 15 do not satisfy 10-day rule", () => {
    const now = new Date("2026-09-16T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      [
        { content: "right shoulder irritated overhead", observedAt: "2026-09-01T12:00:00.000Z" },
        { content: "right shoulder feels off overhead again", observedAt: "2026-09-16T12:00:00.000Z" },
      ],
      { now },
    );
    const result = evaluateRiskSignals(observations, { now });
    const signal = result.signals.find((item) => item.type === "REPEATED_IRRITATION");
    expect(signal?.level).not.toBe("ELEVATED");
    expect(signal?.level).toBe("WATCH");
  });

  it("C: one real + one unknown timestamp must not fabricate the rolling window", () => {
    const now = new Date("2026-09-07T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      [
        { content: "right shoulder irritated overhead", observedAt: "2026-09-01T12:00:00.000Z" },
        { content: "right shoulder feels off overhead again", observedAt: null },
      ],
      { now },
    );
    expect(observations.filter((item) => item.kind === "IRRITATION")).toHaveLength(2);
    expect(observations.some((item) => item.kind === "IRRITATION" && !item.timestampTrusted)).toBe(true);

    const result = evaluateRiskSignals(observations, { now });
    const signal = result.signals.find((item) => item.type === "REPEATED_IRRITATION");
    expect(signal?.level).not.toBe("ELEVATED");
  });

  it("D: vai cấn → SHOULDER_UNSPECIFIED, not RIGHT_SHOULDER", () => {
    expect(normalizeBodyRegion("vai cấn")).toBe("SHOULDER_UNSPECIFIED");
    const batch = observeFromUserMessage("vai cấn overhead", {
      observedAt: "2026-09-01T00:00:00.000Z",
      timestampTrusted: true,
      index: 0,
    });
    expect(batch.find((item) => item.kind === "IRRITATION")?.bodyRegion).toBe("SHOULDER_UNSPECIFIED");
  });

  it("E: vai trái cấn → LEFT_SHOULDER", () => {
    expect(normalizeBodyRegion("vai trái cấn")).toBe("LEFT_SHOULDER");
  });

  it("F: vai phải cấn → RIGHT_SHOULDER", () => {
    expect(normalizeBodyRegion("vai phải cấn")).toBe("RIGHT_SHOULDER");
  });

  it("G: unspecified day1 + explicit right day5 must not become 2 verified RIGHT_SHOULDER", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      [
        { content: "vai cấn overhead", observedAt: "2026-09-01T12:00:00.000Z" },
        { content: "vai phải lại cấn overhead", observedAt: "2026-09-06T12:00:00.000Z" },
      ],
      { now },
    );
    const result = evaluateRiskSignals(observations, { now });
    const right = result.signals.find(
      (item) => item.type === "REPEATED_IRRITATION" && item.bodyRegion === "RIGHT_SHOULDER",
    );
    const unspecified = result.signals.find(
      (item) => item.type === "REPEATED_IRRITATION" && item.bodyRegion === "SHOULDER_UNSPECIFIED",
    );
    expect(right?.observationCount ?? 0).toBe(1);
    expect(right?.level).toBe("WATCH");
    expect(unspecified?.observationCount ?? 0).toBe(1);
    expect(result.signals.some((item) => item.type === "REPEATED_IRRITATION" && item.level === "ELEVATED" && item.bodyRegion === "RIGHT_SHOULDER")).toBe(false);
  });

  it("does not invent synthetic 1-day spacing for string-only history", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      ["right shoulder irritated", "right shoulder irritated again"],
      { now, currentTurnObservedAt: now.toISOString() },
    );
    const irritations = observations.filter((item) => item.kind === "IRRITATION");
    expect(irritations).toHaveLength(2);
    expect(irritations.filter((item) => item.timestampTrusted)).toHaveLength(1);
    expect(irritations.find((item) => !item.timestampTrusted)?.observedAt).toBeNull();

    const result = evaluateRiskSignals(observations, { now });
    expect(result.signals.find((item) => item.type === "REPEATED_IRRITATION")?.level).not.toBe("ELEVATED");
  });

  it("my shoulder hurts → unspecified", () => {
    expect(normalizeBodyRegion("my shoulder hurts")).toBe("SHOULDER_UNSPECIFIED");
  });

  it("manual trusted observations still support elevated fatigue", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    const observations: RiskRawObservation[] = [0, 1, 2].map((offset) => ({
      id: `s${offset}`,
      kind: "LOW_RECOVERY" as const,
      observedAt: new Date(now.getTime() - (2 - offset) * 86400000).toISOString(),
      timestampTrusted: true,
      source: "VERIFIED_LOG" as const,
      recoveryScore: 40,
      recoveryStatus: "POOR" as const,
      sessionKey: `s${offset}`,
    }));
    const result = evaluateRiskSignals(observations, {
      now,
      personalRecoveryBaseline: { mean: 72, sampleSize: 5 },
    });
    expect(result.signals.find((item) => item.type === "SYSTEMIC_FATIGUE")?.level).toBe("ELEVATED");
  });
});
