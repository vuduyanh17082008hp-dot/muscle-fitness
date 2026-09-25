import { describe, expect, it } from "vitest";
import {
  deriveObservationsFromHistory,
  evaluateRiskSignals,
} from "@/lib/dante-core/risk-accumulator";
import type { RiskRawObservation } from "@/lib/dante-core/risk-accumulator/types";

describe("risk — decay and resolution", () => {
  it("decays ELEVATED → WATCH after symptom-free time (product logic, not medical)", () => {
    const now = new Date("2026-09-25T12:00:00.000Z");
    const observations: RiskRawObservation[] = [
      {
        id: "1",
        kind: "IRRITATION",
        observedAt: "2026-09-01T12:00:00.000Z",
        timestampTrusted: true,
        source: "CURRENT_USER_REPORT",
        bodyRegion: "RIGHT_SHOULDER",
        sessionKey: "a",
      },
      {
        id: "2",
        kind: "IRRITATION",
        observedAt: "2026-09-06T12:00:00.000Z",
        timestampTrusted: true,
        source: "CURRENT_USER_REPORT",
        bodyRegion: "RIGHT_SHOULDER",
        sessionKey: "b",
      },
    ];
    const result = evaluateRiskSignals(observations, { now });
    const signal = result.signals.find((item) => item.type === "REPEATED_IRRITATION");
    expect(signal?.level).toBe("WATCH");
  });

  it("explicit symptom-free resolution sets resolvedAt without erasing raw history", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      [
        { content: "Vai phải hơi cấn khi overhead press.", observedAt: "2026-09-01T12:00:00.000Z" },
        { content: "Vai phải lại khó chịu lúc giơ tay qua đầu.", observedAt: "2026-09-07T12:00:00.000Z" },
        {
          content: "Vai đã hoàn toàn ổn hơn 2 tuần và các buổi pressing đều không có triệu chứng.",
          observedAt: "2026-09-20T12:00:00.000Z",
        },
      ],
      { now },
    );
    expect(observations.some((item) => item.kind === "IRRITATION")).toBe(true);
    expect(observations.some((item) => item.kind === "SYMPTOM_FREE_RESOLUTION")).toBe(true);

    const result = evaluateRiskSignals(observations, { now });
    const signal = result.signals.find((item) => item.type === "REPEATED_IRRITATION");
    expect(signal?.resolvedAt).toBeTruthy();
    expect(signal?.level).toBe("NONE");
    expect(observations.filter((item) => item.kind === "IRRITATION").length).toBeGreaterThanOrEqual(2);
  });

  it("fatigue downgrades after recovered sessions replace the streak", () => {
    const observations: RiskRawObservation[] = [
      {
        id: "1",
        kind: "LOW_RECOVERY",
        observedAt: "2026-09-10T12:00:00.000Z",
        timestampTrusted: true,
        source: "VERIFIED_LOG",
        recoveryScore: 40,
        recoveryStatus: "POOR",
        sessionKey: "a",
      },
      {
        id: "2",
        kind: "LOW_RECOVERY",
        observedAt: "2026-09-11T12:00:00.000Z",
        timestampTrusted: true,
        source: "VERIFIED_LOG",
        recoveryScore: 42,
        recoveryStatus: "POOR",
        sessionKey: "b",
      },
      {
        id: "3",
        kind: "LOW_RECOVERY",
        observedAt: "2026-09-12T12:00:00.000Z",
        timestampTrusted: true,
        source: "VERIFIED_LOG",
        recoveryScore: 41,
        recoveryStatus: "POOR",
        sessionKey: "c",
      },
    ];
    const elevated = evaluateRiskSignals(observations, {
      now: new Date("2026-09-12T12:00:00.000Z"),
      personalRecoveryBaseline: { mean: 70, sampleSize: 8 },
    });
    expect(elevated.signals.find((item) => item.type === "SYSTEMIC_FATIGUE")?.level).toBe("ELEVATED");

    const later = evaluateRiskSignals(observations, {
      now: new Date("2026-09-30T12:00:00.000Z"),
      personalRecoveryBaseline: { mean: 70, sampleSize: 8 },
    });
    expect(later.signals.find((item) => item.type === "SYSTEMIC_FATIGUE")).toBeUndefined();
  });
});
