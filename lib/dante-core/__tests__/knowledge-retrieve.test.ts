import { describe, expect, it } from "vitest";
import { retrieveByCategory, retrieveKnowledge } from "@/lib/dante-core/knowledge/retrieve";
import { KNOWLEDGE_REGISTRY } from "@/lib/dante-core/knowledge/registry";

describe("knowledge registry", () => {
  it("never contains a fabricated (empty) title/authors", () => {
    for (const entry of KNOWLEDGE_REGISTRY) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.authors.length).toBeGreaterThan(0);
      expect(entry.year).toBeGreaterThan(1900);
    }
  });

  it("has unique ids", () => {
    const ids = KNOWLEDGE_REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("retrieveKnowledge", () => {
  it("returns relevant entries for a training-volume question", () => {
    const results = retrieveKnowledge("how much weekly training volume should I do for hypertrophy?");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.category).toBe("hypertrophy");
  });

  it("returns relevant entries for a protein question", () => {
    const results = retrieveKnowledge("how much protein do I need per day?");
    expect(results.some((r) => r.entry.category === "protein")).toBe(true);
  });

  it("returns an empty array for a completely unrelated query", () => {
    const results = retrieveKnowledge("what is the capital of France?");
    expect(results).toEqual([]);
  });

  it("respects the category filter", () => {
    const results = retrieveKnowledge("recovery", { category: "sleep" });
    for (const result of results) {
      expect(result.entry.category).toBe("sleep");
    }
  });

  it("respects the limit option", () => {
    const results = retrieveKnowledge("training volume hypertrophy strength sets", { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });
});

describe("retrieveByCategory", () => {
  it("returns only entries from the requested category", () => {
    const results = retrieveByCategory("doms");
    expect(results.length).toBeGreaterThan(0);
    for (const entry of results) {
      expect(entry.category).toBe("doms");
    }
  });
});
