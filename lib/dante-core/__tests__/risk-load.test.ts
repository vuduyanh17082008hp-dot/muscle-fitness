import { describe, expect, it } from "vitest";
import {
  deriveObservationsFromHistory,
  evaluateRiskSignals,
} from "@/lib/dante-core/risk-accumulator";
import type { RiskRawObservation } from "@/lib/dante-core/risk-accumulator/types";

describe("risk — load escalation", () => {
  it("WATCH for rapid increasing bench loads alone (not automatic danger)", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      [
        { content: "bench 100kg", observedAt: "2026-09-16T12:00:00.000Z" },
        { content: "bench 105kg", observedAt: "2026-09-17T12:00:00.000Z" },
        { content: "bench 112.5kg", observedAt: "2026-09-18T12:00:00.000Z" },
      ],
      { now },
    );
    const result = evaluateRiskSignals(observations, { now });
    const load = result.signals.find((item) => item.type === "LOAD_ESCALATION");
    expect(load?.level).toBe("WATCH");
    expect(result.conservativeBias === "NONE" || result.conservativeBias === "LEAN").toBe(true);
  });

  it("does not treat squat escalation as relevant to shoulder irritation", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    const observations: RiskRawObservation[] = [
      {
        id: "1:irr",
        kind: "IRRITATION",
        observedAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
        timestampTrusted: true,
        source: "CURRENT_USER_REPORT",
        bodyRegion: "RIGHT_SHOULDER",
        sessionKey: "s1",
      },
      {
        id: "2:irr",
        kind: "IRRITATION",
        observedAt: new Date(now.getTime() - 1 * 86400000).toISOString(),
        timestampTrusted: true,
        source: "CURRENT_USER_REPORT",
        bodyRegion: "RIGHT_SHOULDER",
        sessionKey: "s2",
      },
      {
        id: "3:sq",
        kind: "LOAD_POINT",
        observedAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
        timestampTrusted: true,
        source: "VERIFIED_LOG",
        movementFamily: "SQUAT",
        loadKg: 100,
        bodyRegion: "RIGHT_KNEE",
        sessionKey: "s3",
      },
      {
        id: "4:sq",
        kind: "LOAD_POINT",
        observedAt: new Date(now.getTime() - 1 * 86400000).toISOString(),
        timestampTrusted: true,
        source: "VERIFIED_LOG",
        movementFamily: "SQUAT",
        loadKg: 110,
        bodyRegion: "RIGHT_KNEE",
        sessionKey: "s4",
      },
      {
        id: "5:sq",
        kind: "LOAD_POINT",
        observedAt: now.toISOString(),
        timestampTrusted: true,
        source: "VERIFIED_LOG",
        movementFamily: "SQUAT",
        loadKg: 120,
        bodyRegion: "RIGHT_KNEE",
        sessionKey: "s5",
      },
    ];

    const result = evaluateRiskSignals(observations, { now });
    expect(result.signals.find((item) => item.type === "REPEATED_IRRITATION")?.level).toBe("ELEVATED");
    expect(result.signals.find((item) => item.type === "LOAD_ESCALATION")?.level).toBe("WATCH");
    expect(result.conservativeBias).toBe("LEAN");
    expect(result.reasons.join(" ")).not.toMatch(/Relevant load escalation overlaps/i);
  });

  it("composes stronger bias when bench escalation overlaps shoulder irritation", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    const observations: RiskRawObservation[] = [
      {
        id: "1:irr",
        kind: "IRRITATION",
        observedAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
        timestampTrusted: true,
        source: "CURRENT_USER_REPORT",
        bodyRegion: "RIGHT_SHOULDER",
        sessionKey: "s1",
      },
      {
        id: "2:irr",
        kind: "IRRITATION",
        observedAt: new Date(now.getTime() - 1 * 86400000).toISOString(),
        timestampTrusted: true,
        source: "CURRENT_USER_REPORT",
        bodyRegion: "RIGHT_SHOULDER",
        sessionKey: "s2",
      },
      {
        id: "3:b",
        kind: "LOAD_POINT",
        observedAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
        timestampTrusted: true,
        source: "VERIFIED_LOG",
        movementFamily: "BENCH",
        loadKg: 100,
        bodyRegion: "SHOULDER_UNSPECIFIED",
        sessionKey: "s3",
      },
      {
        id: "4:b",
        kind: "LOAD_POINT",
        observedAt: new Date(now.getTime() - 1 * 86400000).toISOString(),
        timestampTrusted: true,
        source: "VERIFIED_LOG",
        movementFamily: "BENCH",
        loadKg: 105,
        bodyRegion: "SHOULDER_UNSPECIFIED",
        sessionKey: "s4",
      },
      {
        id: "5:b",
        kind: "LOAD_POINT",
        observedAt: now.toISOString(),
        timestampTrusted: true,
        source: "VERIFIED_LOG",
        movementFamily: "BENCH",
        loadKg: 112.5,
        bodyRegion: "SHOULDER_UNSPECIFIED",
        sessionKey: "s5",
      },
    ];

    const result = evaluateRiskSignals(observations, { now });
    expect(result.conservativeBias).toBe("STRONG");
    expect(result.reasons.join(" ")).toMatch(/Relevant load escalation/i);
  });
});
