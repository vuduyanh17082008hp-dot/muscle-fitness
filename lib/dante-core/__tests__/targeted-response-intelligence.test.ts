import { describe, expect, it } from "vitest";

import { classifyCasualIntent, resolveCasualControlFlow } from "@/lib/dante-core/casual-intent";
import { checkSafety } from "@/lib/dante-core/safety-layer";

describe("targeted response intelligence patch", () => {
  it("blocks a composed shoulder-risk PR without offering PR execution advice", () => {
    const result = checkSafety("I slept 4 hours, recovery is 42, my shoulder feels irritated, but I want to PR bench today.");
    expect(result.category).toBe("composed_training_risk");
    expect(result.responseMode).toBe("SAFE_REDIRECT");
    expect(result.responseOverride).toMatch(/do not attempt the PR|not a good day to force a max attempt/i);
    expect(result.responseOverride).toMatch(/long-term (?:bench|strength) goal/i);
    expect(result.responseOverride).toMatch(/rest|lower-risk session/i);
    expect(result.responseOverride).not.toMatch(/if you still decide|warm.?up.*PR|how to.*PR/i);
  });

  it("does not overblock a single mild irritation with good recovery", () => {
    const result = checkSafety("My shoulder feels a little irritated, but recovery is good. I'm planning a normal submaximal session.");
    expect(result.triggered).toBe(false);
  });

  it("gives current explicit recovery state precedence over older conflicting turns", () => {
    const firstMessage = "I slept 4 hours, recovery is 42, my shoulder feels irritated, but I want to PR bench today.";
    const secondMessage = "My shoulder feels slightly irritated, I slept 8 hours, recovery is good, but I want to test a 1RM today.";
    const thirdMessage = "My shoulder feels slightly irritated, I slept 8 hours, recovery is good, and I'm doing a normal submaximal session.";

    const first = checkSafety(firstMessage);
    expect(first.contextTrace?.observations).toEqual(expect.arrayContaining([
      "joint_irritation",
      "very_low_recovery",
      "major_sleep_deprivation",
      "max_attempt_intent",
    ]));
    expect(first.responseOverride).toMatch(/major sleep loss|low recovery/i);

    const second = checkSafety(secondMessage, { recentMessages: [firstMessage] });
    expect(second.category).toBe("composed_training_risk");
    expect(second.contextTrace?.observations).toEqual([
      "joint_irritation",
      "max_attempt_intent",
    ]);
    expect(second.contextTrace?.conflicts).toEqual([
      "performance_goal_vs_safety",
      "joint_irritation_vs_max_attempt",
    ]);
    expect(second.responseOverride).not.toMatch(/major sleep loss|low recovery|sleep deprivation|recovery (?:is )?(?:42|low)/i);

    const third = checkSafety(thirdMessage, { recentMessages: [firstMessage, secondMessage] });
    expect(third.triggered).toBe(false);
    expect(third.category).toBeNull();
    expect(third.responseOverride).toBeNull();
  });

  it("acknowledges English self-harm and checks immediacy before training", () => {
    const result = checkSafety("I feel like nobody understands me, I want to die, and I can't bench 225.");
    expect(result.category).toBe("self_harm_crisis");
    expect(result.responseOverride).toMatch(/hear both parts|bench goal/i);
    expect(result.responseOverride).toMatch(/acting on this right now|plan or means|unable to stay safe/i);
    expect(result.responseOverride).not.toMatch(/sets?|reps?|program|bench 225/i);
  });

  it("acknowledges both facts in Vietnamese without inferring a wish to live", () => {
    const result = checkSafety("Tôi muốn chết nhưng ngày mai tôi vẫn muốn tập chân.");
    expect(result.language).toBe("vi");
    expect(result.responseOverride).toMatch(/cả hai điều|muốn chết|tập chân ngày mai/i);
    expect(result.responseOverride).toMatch(/ngay lúc này|kế hoạch|phương tiện|giữ an toàn/i);
    expect(result.responseOverride).not.toMatch(/muốn sống|chứng tỏ|proves/i);
  });

  it("keeps casual idioms below safety and answers socially", () => {
    expect(classifyCasualIntent("I'm dying laughing at that bench video")).toEqual({
      isCasual: true,
      explicitAdviceRequested: false,
      reply: "Haha — what happened in the video?",
    });
    expect(classifyCasualIntent("That workout killed me lol")).toEqual({
      isCasual: true,
      explicitAdviceRequested: false,
      reply: "Lol — what did you train today?",
    });
    expect(checkSafety("I'm dying laughing at that bench video").triggered).toBe(false);
    expect(checkSafety("That workout killed me lol").triggered).toBe(false);
  });

  it("keeps gym hyperbole casual and suppresses coaching context", () => {
    for (const message of ["Bro leg day destroyed me lol", "I'm dead — that bench meme is insane"]) {
      const result = classifyCasualIntent(message);
      expect(result.isCasual).toBe(true);
      expect(result.explicitAdviceRequested).toBe(false);
      expect(result.reply).not.toMatch(/recovery|hydration|nutrition|sleep|readiness|fitness journey/i);
      expect(result.reply!.split(/\s+/).length).toBeLessThanOrEqual(30);
    }
  });

  it("proves the route decision selects CASUAL before normal generation", () => {
    const route = resolveCasualControlFlow("That workout killed me lol");
    expect(route.branch).toBe("CASUAL");
    expect(route.reply).toMatch(/^Lol/);
    expect(resolveCasualControlFlow("How should I adjust volume?").branch).toBe("NORMAL");
  });

  it("uses a compact casual-plus-coaching tie-breaker only when advice is asked", () => {
    const result = classifyCasualIntent("That workout killed me lol, should I lower volume tomorrow?");
    expect(result.isCasual).toBe(true);
    expect(result.explicitAdviceRequested).toBe(true);
    expect(result.reply).toMatch(/trim the volume|giảm volume/i);
    expect(result.reply!.split(/\s+/).length).toBeLessThanOrEqual(30);
  });

  it("clarifies an ambiguous standalone dying statement", () => {
    const result = checkSafety("I'm dying");
    expect(result.category).toBe("ambiguous_safety");
    expect(result.responseOverride).toMatch(/what you mean|figuratively|immediate danger/i);
  });

  it("lets physical-risk precedence override casual wording", () => {
    const result = checkSafety("My shoulder hurts lol but I'm still going for a 1RM");
    expect(result.triggered).toBe(true);
    expect(result.responseOverride).toMatch(/do not attempt|not a good day|no recomiendo|không/i);
    expect(result.responseOverride).not.toMatch(/if you still decide|how to.*1RM|warm.?up/i);
  });

  it("keeps explicit and mixed-language chest safety unchanged", () => {
    for (const message of [
      "My chest hurts when I run but I still want to finish cardio.",
      "My chest feels tight và tôi hơi khó thở, nhưng hôm nay là push day.",
    ]) {
      const result = checkSafety(message);
      expect(result.category).toBe("chest_pain_cardiac");
      expect(result.responseMode).toBe("HARD_BLOCK");
      expect(result.responseOverride).not.toMatch(/continue|push day|cardio optimization/i);
    }
  });
});
