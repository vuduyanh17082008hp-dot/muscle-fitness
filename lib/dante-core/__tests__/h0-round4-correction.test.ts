import { describe, expect, it } from "vitest";
import { answerShoulderSide, resolveLaterality, type LateralityEvidence } from "@/lib/dante-core/coherence/corrections";
import { authoritativeLaterality } from "@/lib/dante-core/coherence/gates";
import { prepareCoherenceTurn } from "@/lib/dante-core/coherence/pipeline";
import { foldText, normalizeInput } from "@/lib/dante-core/coherence/understanding";
import type { VersionedState } from "@/lib/dante-core/coherence/types";

const NOW = "2026-10-14T02:00:00.000Z";
const folded = (message: string) => foldText(normalizeInput(message).text);

function evidence(message: string, hasReferent = false): LateralityEvidence {
  return resolveLaterality(folded(message), hasReferent).evidence ?? "UNKNOWN";
}

describe("H0 round 4 laterality correction", () => {
  it("trajectory A: unspecified, then right, then left", () => {
    let prior: VersionedState | null = null;
    const turn = (message: string) => {
      const prepared = prepareCoherenceTurn({ message, now: NOW, prior, sessionId: "r4-a" });
      prior = prepared.state;
      return authoritativeLaterality(prepared.state);
    };

    expect(evidence("My shoulder hurts.")).toBe("UNKNOWN");
    expect(turn("My shoulder hurts.")).toBeNull();
    expect(answerShoulderSide("What side did I say?", authoritativeLaterality(prior!), "en")).toMatch(/didn't specify/i);

    expect(evidence("Actually it's my right shoulder.")).toBe("USER_CORRECTION");
    expect(turn("Actually it's my right shoulder.")).toBe("RIGHT");
    expect(answerShoulderSide("What side?", authoritativeLaterality(prior!), "en")).toMatch(/right shoulder/);

    expect(evidence("No, left shoulder.", true)).toBe("USER_CORRECTION");
    expect(turn("No, left shoulder.")).toBe("LEFT");
    expect(answerShoulderSide("Which side?", authoritativeLaterality(prior!), "en")).toMatch(/left shoulder/);
  });

  it("trajectory B: an explicit right shoulder is the side", () => {
    const resolved = resolveLaterality(folded("My right shoulder hurts."), false);
    expect(resolved.evidence).toBe("USER_EXPLICIT");
    expect(resolved.value).toBe("RIGHT");
    expect(resolved.explicit).toBe(false);
    const prepared = prepareCoherenceTurn({ message: "My right shoulder hurts.", now: NOW, sessionId: "r4-b" });
    expect(answerShoulderSide("Which shoulder?", authoritativeLaterality(prepared.state), "en")).toMatch(/right shoulder/);
  });

  it("trajectory C: a yes/no guess is not answered yes", () => {
    expect(evidence("My shoulder feels weird.")).toBe("UNKNOWN");
    expect(resolveLaterality(folded("Is it my right shoulder?"), false).value).toBeNull();
    expect(answerShoulderSide("Is it my right shoulder?", "RIGHT", "en")).toMatch(/won't decide/i);
    expect(answerShoulderSide("Is it my right shoulder?", null, "en")).not.toMatch(/\byes\b/i);
  });

  it("trajectory D: uncertain recall is not a verified fact", () => {
    const resolved = resolveLaterality(folded("Earlier I think it was my right shoulder, not sure."), false);
    expect(resolved.evidence).toBe("USER_UNCERTAIN_RECALL");
    expect(resolved.value).toBeNull();
    const prepared = prepareCoherenceTurn({
      message: "Earlier I think it was my right shoulder, not sure.",
      now: NOW,
      sessionId: "r4-d",
    });
    expect(authoritativeLaterality(prepared.state)).toBeNull();
  });

  const cases: Array<[string, LateralityEvidence, string | null]> = [
    ["My shoulder hurts.", "UNKNOWN", null],
    ["My left shoulder hurts.", "USER_EXPLICIT", "LEFT"],
    ["My right shoulder hurts.", "USER_EXPLICIT", "RIGHT"],
    ["Both shoulders hurt.", "UNKNOWN", null],
    ["Actually it's my right shoulder.", "USER_CORRECTION", "RIGHT"],
    ["No, left shoulder.", "USER_CORRECTION", "LEFT"],
    ["No, right shoulder.", "USER_CORRECTION", "RIGHT"],
    ["Actually it's my left shoulder.", "USER_CORRECTION", "LEFT"],
    ["Earlier I think it was my right shoulder, not sure.", "USER_UNCERTAIN_RECALL", null],
    ["Maybe the left shoulder?", "USER_UNCERTAIN_RECALL", null],
    ["Is it my right shoulder?", "UNKNOWN", null],
    ["Was it the left shoulder?", "UNKNOWN", null],
    ["Vai phải đau.", "USER_EXPLICIT", "RIGHT"],
    ["Vai trái đau.", "USER_EXPLICIT", "LEFT"],
    ["Thực ra là vai phải.", "USER_CORRECTION", "RIGHT"],
    ["Không, vai trái.", "USER_CORRECTION", "LEFT"],
    ["Hình như vai phải, không chắc.", "USER_UNCERTAIN_RECALL", null],
    ["Có phải vai phải không?", "UNKNOWN", null],
    ["What side?", "UNKNOWN", null],
    ["Bên nào?", "UNKNOWN", null],
    ["My shoulder hurts on both sides.", "UNKNOWN", null],
    ["The assistant guessed right, but I didn't say.", "UNKNOWN", null],
  ];

  it.each(cases)("%s → %s", (message, expected, value) => {
    const resolved = resolveLaterality(folded(message), false);
    expect(resolved.evidence).toBe(expected);
    expect(resolved.value).toBe(value);
  });
});
