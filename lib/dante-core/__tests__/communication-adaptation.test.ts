import { describe, expect, it } from "vitest";

import {
  buildCommunicationPromptHints,
  resolveCommunicationMode,
  resolveCommunicationStyle,
} from "@/lib/dante-core/communication-adaptation";

describe("Phase 2D communication adaptation", () => {
  it("defaults to COACH from coaching preference", () => {
    expect(resolveCommunicationMode({ coachingPreference: "direct" })).toBe("COACH");
    expect(resolveCommunicationMode({ coachingPreference: "detailed" })).toBe("EXPLAIN");
  });

  it("prioritizes PRESENCE over challenge on sensitive turns", () => {
    expect(
      resolveCommunicationMode({
        coachingPreference: "direct",
        asksChallenge: true,
        needsPresence: true,
      }),
    ).toBe("PRESENCE");
  });

  it("supports COACH / EXPLAIN / CHALLENGE / REFLECT / PRESENCE", () => {
    expect(resolveCommunicationMode({ coachingPreference: null, asksWhy: true })).toBe("EXPLAIN");
    expect(resolveCommunicationMode({ coachingPreference: null, asksChallenge: true })).toBe("CHALLENGE");
    expect(resolveCommunicationMode({ coachingPreference: null, asksReflect: true })).toBe("REFLECT");
    expect(resolveCommunicationMode({ coachingPreference: null, needsPresence: true })).toBe("PRESENCE");
  });

  it("emits lightweight style knobs without inventing a psych profile", () => {
    const style = resolveCommunicationStyle({
      coachingPreference: "concise",
      asksWhy: true,
    });

    expect(style.mode).toBe("EXPLAIN");
    expect(style.brevity).toBeGreaterThanOrEqual(0);
    expect(style.brevity).toBeLessThanOrEqual(1);
    expect(style.directness).toBeGreaterThanOrEqual(0);
    expect(style.technicalDepth).toBeGreaterThanOrEqual(0);
    expect(style.motivationLevel).toBeGreaterThanOrEqual(0);
    expect(style.reflectionTolerance).toBeGreaterThanOrEqual(0);

    const hints = buildCommunicationPromptHints(style);
    expect(hints).toContain("Communication mode: EXPLAIN");
    expect(hints.toLowerCase()).not.toContain("personality disorder");
    expect(hints.toLowerCase()).not.toContain("psychological profile");
  });
});
