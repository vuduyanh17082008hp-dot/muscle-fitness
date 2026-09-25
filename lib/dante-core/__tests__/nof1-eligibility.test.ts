import { describe, expect, it } from "vitest";
import {
  evaluateNof1Eligibility,
  isSingleSessionOvertrigger,
  detectNof1Trigger,
} from "@/lib/dante-core/nof1-engine";
import { evaluateRiskSignals } from "@/lib/dante-core/risk-accumulator";
import type { RiskRawObservation } from "@/lib/dante-core/risk-accumulator/types";

describe("nof1 — eligibility", () => {
  it("triggers on competing sleep vs volume language", () => {
    expect(
      detectNof1Trigger(
        "Ba tuần gần đây performance lúc tốt lúc tệ. Sleep và volume cũng đổi cùng lúc. Tôi không biết cái nào gây ra.",
      ),
    ).toBe("COMPETING_CAUSES");
  });

  it("rejects single bad session overtrigger", () => {
    const message = "Bench sucked today. Should we run an experiment?";
    expect(isSingleSessionOvertrigger(message)).toBe(true);
    const eligibility = evaluateNof1Eligibility({ message, safetyTriggered: false });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.tooEarly).toBe(true);
  });

  it("blocks provocative overhead experiment when irritation is elevated", () => {
    const now = new Date();
    const observations: RiskRawObservation[] = [
      {
        id: "1",
        kind: "IRRITATION",
        observedAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
        timestampTrusted: true,
        source: "CURRENT_USER_REPORT",
        bodyRegion: "RIGHT_SHOULDER",
        sessionKey: "a",
      },
      {
        id: "2",
        kind: "IRRITATION",
        observedAt: now.toISOString(),
        timestampTrusted: true,
        source: "CURRENT_USER_REPORT",
        bodyRegion: "RIGHT_SHOULDER",
        sessionKey: "b",
      },
    ];
    const risk = evaluateRiskSignals(observations, { now });
    const eligibility = evaluateNof1Eligibility({
      message: "Let's experiment with heavier overhead press.",
      safetyTriggered: false,
      riskEvaluation: risk,
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockedByRisk || eligibility.blockedBySafety).toBe(true);
  });

  it("does not trigger from ego bait alone", () => {
    const eligibility = evaluateNof1Eligibility({
      message: "If you're actually smart, prove volume is the problem.",
      safetyTriggered: false,
    });
    expect(eligibility.eligible).toBe(false);
  });
});
