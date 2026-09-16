import { describe, expect, it } from "vitest";
import { hasVerifiedMemory, trainingLoadReadinessCaveat, verifiedMemoryItems } from "@/lib/dante-core/epistemics/classify";

describe("verifiedMemoryItems / hasVerifiedMemory", () => {
  it("test: VERIFIED MEMORY classification — maps actually-retrieved records to verified_memory items", () => {
    const items = verifiedMemoryItems([{ summary: "Client trains 4x/week, prioritizes chest." }]);
    expect(items).toEqual([{ kind: "verified_memory", label: "Client trains 4x/week, prioritizes chest." }]);
  });

  it("test: no verified memory stays unknown/empty — never invented from nothing", () => {
    expect(hasVerifiedMemory([])).toBe(false);
    expect(verifiedMemoryItems([])).toEqual([]);
  });

  it("hasVerifiedMemory is true only when records actually exist", () => {
    expect(hasVerifiedMemory([{ summary: "x" }])).toBe(true);
  });
});

describe("trainingLoadReadinessCaveat — test 16: trainingLoad green does not imply readiness when check-in missing", () => {
  it("returns a caveat when a training-load state exists but today's recovery check-in is missing", () => {
    const caveat = trainingLoadReadinessCaveat({ trainingLoadState: "green", hasRecoveryCheckin: false });
    expect(caveat).not.toBeNull();
    expect(caveat).toContain("green");
    expect(caveat).toContain("does not establish readiness");
  });

  it("returns null once today's recovery check-in exists", () => {
    expect(trainingLoadReadinessCaveat({ trainingLoadState: "green", hasRecoveryCheckin: true })).toBeNull();
  });

  it("returns null when there is no training-load state at all", () => {
    expect(trainingLoadReadinessCaveat({ trainingLoadState: null, hasRecoveryCheckin: false })).toBeNull();
    expect(trainingLoadReadinessCaveat({ trainingLoadState: undefined, hasRecoveryCheckin: false })).toBeNull();
  });

  it("applies regardless of which load state is reported, not just green", () => {
    const caveat = trainingLoadReadinessCaveat({ trainingLoadState: "amber", hasRecoveryCheckin: false });
    expect(caveat).toContain("amber");
  });
});
