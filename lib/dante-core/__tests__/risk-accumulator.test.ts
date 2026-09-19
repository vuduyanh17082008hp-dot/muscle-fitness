import { describe, expect, it } from "vitest";
import {
  deriveObservationsFromHistory,
  evaluateRiskSignals,
  observeFromUserMessage,
} from "@/lib/dante-core/risk-accumulator";

describe("risk accumulator — core", () => {
  it("keeps raw observations separate from derived signals", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      [
        { content: "right shoulder irritated overhead", observedAt: "2026-09-12T12:00:00.000Z" },
        { content: "right shoulder feels off overhead again", observedAt: "2026-09-18T12:00:00.000Z" },
      ],
      { now },
    );

    expect(observations.every((item) => item.kind === "IRRITATION")).toBe(true);
    expect(observations.every((item) => !/injury|chronic/i.test(item.kind))).toBe(true);

    const result = evaluateRiskSignals(observations, { now });
    const signal = result.signals.find((item) => item.type === "REPEATED_IRRITATION");
    expect(signal?.level).toBe("ELEVATED");
    expect(signal?.bodyRegion).toBe("RIGHT_SHOULDER");
    expect(signal?.observationCount).toBe(2);
    expect(signal?.reasons.some((reason) => /not a medical/i.test(reason))).toBe(true);
    expect(result.conservativeBias).not.toBe("NONE");
  });

  it("counts one turn as one irritation observation even with paraphrases", () => {
    const batch = observeFromUserMessage(
      "shoulder hurts, shoulder irritated, shoulder feels off overhead",
      { observedAt: "2026-09-10T00:00:00.000Z", timestampTrusted: true, index: 0 },
    );
    const irritations = batch.filter((item) => item.kind === "IRRITATION");
    expect(irritations).toHaveLength(1);
    expect(irritations[0].bodyRegion).toBe("SHOULDER_UNSPECIFIED");
  });

  it("does not invent five evidence refs from an unverified historical count claim", () => {
    const batch = observeFromUserMessage(
      "You remember my shoulder hurt five times last month.",
      { observedAt: "2026-09-18T00:00:00.000Z", timestampTrusted: true, index: 0 },
    );
    expect(batch.filter((item) => item.kind === "IRRITATION")).toHaveLength(0);
  });

  it("never stores injury identity labels on raw observations", () => {
    const batch = observeFromUserMessage("vai phải hơi cấn overhead", {
      observedAt: "2026-09-18T00:00:00.000Z",
      timestampTrusted: true,
      index: 0,
    });
    expect(JSON.stringify(batch)).not.toMatch(/injury-prone|chronic injury|shoulder injury/i);
  });
});
