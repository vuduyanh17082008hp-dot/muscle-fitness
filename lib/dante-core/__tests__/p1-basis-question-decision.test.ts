/**
 * Open P1 (UX final evaluation 2026-10-28): "Based on my <workout> and <food log>, what should I prioritize tonight?"
 * was realised with the rain/skip conditional lead — "That's not enough reason to skip. If the trip is unsafe, stay
 * home." — prepended to an unrelated nutrition/recovery answer. A "based on my …" basis is not a go/skip question.
 */
import { describe, expect, it } from "vitest";
import { finishCoherenceDraft, prepareCoherenceTurn } from "@/lib/dante-core/coherence";

const NOW = "2026-10-29T12:00:00.000Z";
const DRAFT =
  "Prioritize your post-workout nutrition tonight, focusing on protein and carbohydrates. You have 106 g of protein left.";

function finish(message: string, draft = DRAFT) {
  const prepared = prepareCoherenceTurn({ message, now: NOW, sessionId: "p1-basis" });
  const finished = finishCoherenceDraft({ prepared, message, phase1Draft: draft });
  return {
    written: prepared.analysis.obligations.find((o) => o.intent === "OPEN_REQUEST")?.decisionState ?? "NONE",
    response: finished.response,
  };
}

describe("P1: a 'based on my …' planning question is not a skip decision", () => {
  it.each([
    "Based on my completed Full Body B workout and today’s nutrition log, what should I prioritize tonight?",
    "Based on my workout and nutrition today, what should I focus on tonight?",
    "Considering only my food log, what should I eat tonight?",
    "I finished Full Body B today. What should I prioritize tonight?",
  ])("%s", (message) => {
    const turn = finish(message);
    expect(turn.written).not.toBe("CONDITIONAL_RESOLVED");
    expect(turn.response).not.toMatch(/not enough reason to skip|trip is unsafe|get to the gym/i);
    expect(turn.response).toMatch(/protein/);
  });

  it("the scoped skip question it was built for still resolves conditionally", () => {
    const turn = finish(
      "only considering that it is raining heavy out there, should i get myself to the gym",
      "If it's raining heavily, consider the safety of traveling to the gym.",
    );
    expect(turn.written).toBe("CONDITIONAL_RESOLVED");
    expect(turn.response).toMatch(/^Rain alone isn't enough reason to skip\./);
  });
});
