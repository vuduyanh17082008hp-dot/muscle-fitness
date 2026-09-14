import { describe, expect, it } from "vitest";
import { classifyKnowledgeBrainRoute, type ChatIntent } from "@/lib/dante-core/knowledge-brain/route";

function intent(overrides: Partial<ChatIntent> = {}): ChatIntent {
  return {
    training: false,
    nutrition: false,
    supplement: false,
    health: false,
    recovery: false,
    ...overrides,
  };
}

describe("classifyKnowledgeBrainRoute", () => {
  it("routes an exercise-technique question to the Knowledge Brain (test A)", () => {
    const route = classifyKnowledgeBrainRoute(
      "How do I perform a Romanian deadlift safely?",
      intent({ training: true }),
    );

    expect(route.use).toBe(true);
    expect(route.categories).toEqual(expect.arrayContaining(["exercise_technique", "safety"]));
  });

  it("skips the Knowledge Brain for a structured macro-arithmetic question (test B)", () => {
    const route = classifyKnowledgeBrainRoute(
      "How much protein do I have left today?",
      intent({ nutrition: true }),
    );

    expect(route.use).toBe(false);
    expect(route.categories).toEqual([]);
  });

  it("skips the Knowledge Brain for a Today's Plan question", () => {
    const route = classifyKnowledgeBrainRoute("What is my workout today?", intent({ training: true }));

    expect(route.use).toBe(false);
  });

  it("routes an evidence question about a supplement to the Knowledge Brain", () => {
    const route = classifyKnowledgeBrainRoute(
      "What does evidence say about creatine?",
      intent({ supplement: true }),
    );

    expect(route.use).toBe(true);
    expect(route.categories).toContain("supplements");
  });

  it("does not route a plain adaptive-recommendation question to the Knowledge Brain", () => {
    const route = classifyKnowledgeBrainRoute("Should I increase my bench?", intent({ training: true }));

    expect(route.use).toBe(false);
  });

  it("never routes a direct current-time/date question to the Knowledge Brain (Test C)", () => {
    // Current time is deterministic server-computed context (see
    // lib/dante-core/temporal-context.ts), never something RAG should
    // be asked to "retrieve".
    expect(classifyKnowledgeBrainRoute("What time is it?", intent()).use).toBe(false);
    expect(classifyKnowledgeBrainRoute("What day is it today?", intent()).use).toBe(false);
    expect(classifyKnowledgeBrainRoute("Is my workout today?", intent({ training: true })).use).toBe(false);
  });
});
