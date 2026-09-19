import { describe, expect, it } from "vitest";
import {
  deriveObservationsFromHistory,
  evaluateRiskSignals,
  normalizeBodyRegion,
} from "@/lib/dante-core/risk-accumulator";

describe("risk — multilingual + DOMS guard", () => {
  it("normalizes Vietnamese / English / mixed shoulder phrases without inventing laterality", () => {
    expect(normalizeBodyRegion("vai phải")).toBe("RIGHT_SHOULDER");
    expect(normalizeBodyRegion("right shoulder")).toBe("RIGHT_SHOULDER");
    expect(normalizeBodyRegion("shoulder bên phải")).toBe("RIGHT_SHOULDER");
    expect(normalizeBodyRegion("vai")).toBe("SHOULDER_UNSPECIFIED");
    expect(normalizeBodyRegion("shoulder")).toBe("SHOULDER_UNSPECIFIED");
    expect(normalizeBodyRegion("lưng dưới")).toBe("LOWER_BACK");
    expect(normalizeBodyRegion("lower back")).toBe("LOWER_BACK");
    expect(normalizeBodyRegion("thắt lưng")).toBe("LOWER_BACK");
  });

  it("elevates repeated VI irritation across trusted days", () => {
    const now = new Date("2026-09-07T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      [
        { content: "Vai phải hơi cấn khi overhead press.", observedAt: "2026-09-01T12:00:00.000Z" },
        { content: "Vai phải lại khó chịu lúc giơ tay qua đầu.", observedAt: "2026-09-07T12:00:00.000Z" },
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

  it("maps mixed-language irritation equivalently when both are unspecified", () => {
    const now = new Date("2026-09-07T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      [
        { content: "vai lại cấn overhead", observedAt: "2026-09-01T12:00:00.000Z" },
        { content: "shoulder feels off overhead again", observedAt: "2026-09-07T12:00:00.000Z" },
      ],
      { now },
    );
    const result = evaluateRiskSignals(observations, { now });
    expect(result.signals.find((item) => item.type === "REPEATED_IRRITATION")).toMatchObject({
      bodyRegion: "SHOULDER_UNSPECIFIED",
      level: "ELEVATED",
    });
  });

  it("does not treat normal DOMS as REPEATED_IRRITATION", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      [
        { content: "My quads are sore after leg day.", observedAt: "2026-09-01T12:00:00.000Z" },
        { content: "Quads sore again after hard leg session.", observedAt: "2026-09-06T12:00:00.000Z" },
      ],
      { now },
    );
    expect(observations.every((item) => item.kind === "DOMS")).toBe(true);
    const result = evaluateRiskSignals(observations, { now });
    expect(result.signals.find((item) => item.type === "REPEATED_IRRITATION")).toBeUndefined();
  });
});
