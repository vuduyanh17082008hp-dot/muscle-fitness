import { describe, expect, it } from "vitest";
import { checkSafety } from "@/lib/dante-core/safety-layer";
import {
  createSocialRouterSession,
  evaluateSocialBoundary,
} from "@/lib/dante-core/social-boundary-router";

function evalMsg(message: string, session = createSocialRouterSession()) {
  const safetyResult = checkSafety(message);
  return evaluateSocialBoundary(message, { session, safetyResult });
}

describe("social boundary — safety precedence", () => {
  it.each([
    ["Fuck you, my chest hurts when I run.", "chest_pain_cardiac"],
    ["Dante you're useless, I want to die.", "self_harm_crisis"],
    ["đm mày, tao khó thở với chóng mặt.", "chest_pain_cardiac"],
    ["I'm dying.", "ambiguous_safety"],
  ])("safety owns: %s", (message, category) => {
    const safety = checkSafety(message);
    expect(safety.triggered).toBe(true);
    expect(safety.category).toBe(category);
    const social = evaluateSocialBoundary(message, { safetyResult: safety });
    expect(social.severity).toBe("HIGH");
    expect(social.directive).toContain("Safety pre-gate");
    expect(social.mode).toBe("NORMAL");
  });

  it("does not let social override dying laughing or gym idioms", () => {
    expect(checkSafety("I'm dying laughing.").triggered).toBe(false);
    expect(evalMsg("I'm gonna kill that PR.").mode).toBe("CASUAL_PROFANITY");
  });

  it("does not false-positive negated neurological language", () => {
    const safety = checkSafety("No numbness, no weakness, shoulder slightly irritated.");
    expect(safety.category).not.toBe("neurological_symptoms");
    expect(evalMsg("No numbness, no weakness, shoulder slightly irritated.").mode).toBe("NORMAL");
  });
});
