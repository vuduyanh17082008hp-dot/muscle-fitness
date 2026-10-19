/**
 * H0 closure — source delivery: a rendered canonical source must back a claim the final reply makes about ITS entity.
 * Matching an outcome word ("strength", "muscle growth") is not naming the record whose papers those are.
 */
import { describe, expect, it } from "vitest";
import { buildIntelligenceBrief, citedCanonicalSources, getRecord } from "@/lib/intelligence/performance-core";

const shown = (message: string, reply: string) =>
  citedCanonicalSources(buildIntelligenceBrief({ message, coach: "DANTE", canRetrieve: true }).knowledge, reply).map((s) => s.sourceId).sort();
const sourcesOf = (...recordIds: string[]) => [...new Set(recordIds.flatMap((id) => getRecord(id)!.sources))].sort();
/** Papers that belong to `recordId` and to none of `kept`. */
const onlyIn = (recordId: string, kept: string[]) => getRecord(recordId)!.sources.filter((id) => !sourcesOf(...kept).includes(id));

describe("rendered canonical sources follow the reply's entities, not its outcome words", () => {
  it("creatine vs beta-alanine for strength: supplement papers only, no strength-training papers", () => {
    const ids = shown("creatine vs beta-alanine for strength", "For strength, creatine has the stronger evidence. Beta-alanine mainly helps efforts of 1-4 minutes.");
    const kept = ["supplement-creatine", "supplement-beta-alanine"];
    expect(ids.every((id) => sourcesOf(...kept).includes(id))).toBe(true);
    expect(ids.filter((id) => onlyIn("training-strength-basics", kept).includes(id))).toEqual([]);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("training comparison: failure papers, plus hypertrophy guidance only because the reply names muscle growth (its alias)", () => {
    const ids = shown("is training to failure better than stopping short for muscle growth?", "Training to failure isn't required for muscle growth; stopping 1-3 reps short works too.");
    expect(ids).toEqual(expect.arrayContaining(sourcesOf("training-failure")));
    expect(ids.every((id) => sourcesOf("training-failure", "training-hypertrophy-basics").includes(id))).toBe(true);
    expect(shown("is training to failure better than stopping short for muscle growth?", "Training to failure isn't required; stopping 1-3 reps short works too.")).toEqual(sourcesOf("training-failure"));
  });

  it("magnesium sleep: the sleep record is named by its alias, so its papers are relevant background", () => {
    const ids = shown("does magnesium help sleep if I'm not deficient?", "A sleep benefit from magnesium isn't established if you're not deficient; sleep habits matter more.");
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => sourcesOf("training-recovery-sleep", "nutrition-micronutrient-adequacy").includes(id))).toBe(true);
  });

  it.each([
    ["omega-3 liver fat (a gap: no canonical claim, nothing to cite)", "does omega 3 reduce liver fat?", "A liver-fat benefit from omega-3 isn't established in what I can check."],
    ["zinc / testosterone (a gap)", "does zinc boost testosterone if my intake is adequate?", "A testosterone benefit from zinc isn't established if your intake is adequate."],
  ])("%s", (_name, message, reply) => {
    expect(shown(message, reply)).toEqual([]);
  });

  it("a reply that never discusses an in-scope entity shows none of its sources", () => {
    expect(shown("creatine vs beta-alanine for strength", "Train hard, sleep well and eat enough protein.")).toEqual([]);
  });
});
