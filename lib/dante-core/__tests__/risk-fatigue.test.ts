import { describe, expect, it } from "vitest";
import {
  evaluateRiskSignals,
  FATIGUE_BASELINE_MIN,
} from "@/lib/dante-core/risk-accumulator";
import type { RiskRawObservation } from "@/lib/dante-core/risk-accumulator/types";

describe("risk — systemic fatigue", () => {
  it("ELEVATED when 3 consecutive sessions are below personal baseline", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    const observations: RiskRawObservation[] = [0, 1, 2].map((offset) => ({
      id: `s${offset}:low`,
      kind: "LOW_RECOVERY",
      observedAt: new Date(now.getTime() - (2 - offset) * 86400000).toISOString(),
      timestampTrusted: true,
      source: "VERIFIED_LOG",
      recoveryScore: 42 + offset,
      recoveryStatus: "POOR",
      sessionKey: `session-${offset}`,
    }));

    const result = evaluateRiskSignals(observations, {
      now,
      personalRecoveryBaseline: { mean: 72, sampleSize: FATIGUE_BASELINE_MIN },
    });
    const fatigue = result.signals.find((item) => item.type === "SYSTEMIC_FATIGUE");
    expect(fatigue?.level).toBe("ELEVATED");
    expect(fatigue?.reasons.join(" ")).toMatch(/personal baseline/i);
    expect(fatigue?.reasons.join(" ")).not.toMatch(/overtraining diagnosis/i);
  });

  it("does not claim below personal average without enough baseline", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    const observations: RiskRawObservation[] = [
      {
        id: "a",
        kind: "LOW_RECOVERY",
        observedAt: new Date(now.getTime() - 86400000).toISOString(),
        timestampTrusted: true,
        source: "CURRENT_USER_REPORT",
        recoveryScore: 48,
        recoveryStatus: "POOR",
        sessionKey: "s1",
      },
      {
        id: "b",
        kind: "LOW_RECOVERY",
        observedAt: now.toISOString(),
        timestampTrusted: true,
        source: "CURRENT_USER_REPORT",
        recoveryScore: 50,
        recoveryStatus: "POOR",
        sessionKey: "s2",
      },
    ];
    const result = evaluateRiskSignals(observations, {
      now,
      personalRecoveryBaseline: { mean: 70, sampleSize: 2 },
    });
    const fatigue = result.signals.find((item) => item.type === "SYSTEMIC_FATIGUE");
    expect(fatigue?.level).toBe("WATCH");
    expect(fatigue?.reasons.join(" ")).toMatch(/insufficient baseline/i);
    expect(fatigue?.reasons.join(" ")).not.toMatch(/ran below personal baseline across/i);
  });
});
