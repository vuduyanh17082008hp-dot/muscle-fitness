import { describe, expect, it } from "vitest";
import {
  deriveObservationsFromHistory,
  evaluateRiskSignals,
} from "@/lib/dante-core/risk-accumulator";

describe("risk — repeated irritation", () => {
  it("elevates after 2 credible same-region observations within 10 trusted days", () => {
    const now = new Date("2026-09-07T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      [
        { content: "right shoulder irritated overhead", observedAt: "2026-09-01T12:00:00.000Z" },
        { content: "right shoulder feels off overhead again", observedAt: "2026-09-07T12:00:00.000Z" },
      ],
      { now },
    );
    const result = evaluateRiskSignals(observations, { now });
    const signal = result.signals.find((item) => item.type === "REPEATED_IRRITATION");
    expect(signal).toMatchObject({
      type: "REPEATED_IRRITATION",
      bodyRegion: "RIGHT_SHOULDER",
      observationCount: 2,
      level: "ELEVATED",
    });
  });

  it("WATCH for a single credible observation", () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      [{ content: "Vai phải hơi cấn khi overhead press.", observedAt: now.toISOString() }],
      { now },
    );
    const result = evaluateRiskSignals(observations, { now });
    const signal = result.signals.find((item) => item.type === "REPEATED_IRRITATION");
    expect(signal?.level).toBe("WATCH");
    expect(signal?.observationCount).toBe(1);
  });

  it("tracks different regions independently", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      [
        { content: "right shoulder irritated overhead", observedAt: "2026-09-01T12:00:00.000Z" },
        { content: "right elbow hurts during skull crushers again", observedAt: "2026-09-06T12:00:00.000Z" },
      ],
      { now },
    );
    const result = evaluateRiskSignals(observations, { now });
    const shoulder = result.signals.find(
      (item) => item.type === "REPEATED_IRRITATION" && item.bodyRegion === "RIGHT_SHOULDER",
    );
    const elbow = result.signals.find(
      (item) => item.type === "REPEATED_IRRITATION" && item.bodyRegion === "RIGHT_ELBOW",
    );
    expect(shoulder?.level).toBe("WATCH");
    expect(elbow?.level).toBe("WATCH");
    expect(shoulder?.observationCount).toBe(1);
    expect(elbow?.observationCount).toBe(1);
  });
});
