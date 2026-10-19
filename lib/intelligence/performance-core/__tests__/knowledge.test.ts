import { describe, expect, it } from "vitest";

import {
  KNOWLEDGE_GAPS, KNOWLEDGE_RECORDS, SOURCE_REGISTRY, getRecord, getSource, resolveKnowledge, retrievalWarranted, settleKnowledgeState,
  strongestSupport, validateRegistry,
} from "..";

const record = (id: string) => getRecord(id)!;
const resolve = (message: string, canRetrieve = true, priorUserMessages: string[] = []) => resolveKnowledge({ message, canRetrieve, priorUserMessages });
const ids = (message: string) => resolve(message).records.map((r) => r.id);

describe("knowledge registry — structural contract", () => {
  it("is internally sound (ids, sources, folded tags, claim/source rules)", () => {
    expect(validateRegistry()).toEqual([]);
  });

  it("every source is PubMed-abstract verified with a pmid and doi — no unverified citation can enter", () => {
    for (const source of SOURCE_REGISTRY) {
      expect(source.verifiedVia).toBe("PUBMED_ABSTRACT");
      expect(source.pmid).toMatch(/^\d{7,9}$/);
      expect(source.doi).toMatch(/^10\.\d{4,}\//);
      expect(source.year).toBeGreaterThan(2000);
    }
    expect(new Set(SOURCE_REGISTRY.map((s) => s.pmid)).size).toBe(SOURCE_REGISTRY.length);
  });

  it("every registered source is used by a record, and every record cites a registered source", () => {
    const used = new Set(KNOWLEDGE_RECORDS.flatMap((r) => r.sources));
    expect(SOURCE_REGISTRY.filter((s) => !used.has(s.id)).map((s) => s.id)).toEqual([]);
    for (const r of KNOWLEDGE_RECORDS) for (const id of r.sources) expect(getSource(id)).not.toBeNull();
  });

  it("a claim with no source is only ever an UNKNOWN / INSUFFICIENT statement of absence", () => {
    for (const r of KNOWLEDGE_RECORDS) {
      for (const c of r.claims.filter((claim) => claim.sourceIds.length === 0)) {
        expect(c.claimType).toBe("UNKNOWN");
        expect(c.evidenceStrength).toBe("INSUFFICIENT");
      }
    }
  });

  it("covers the representative ICH-1 set", () => {
    const topics = KNOWLEDGE_RECORDS.map((r) => r.id);
    for (const id of [
      "training-hypertrophy-basics", "training-strength-basics", "training-volume", "training-intensity", "training-frequency", "training-rir-rpe",
      "training-failure", "training-progressive-overload", "training-deload-fatigue", "training-recovery-sleep", "training-cardio-interference",
      "nutrition-energy-balance", "nutrition-protein-adequacy", "nutrition-protein-quality", "nutrition-carb-role", "nutrition-dietary-fat",
      "nutrition-meal-distribution", "nutrition-peri-workout", "nutrition-hydration", "nutrition-electrolytes", "nutrition-micronutrient-adequacy",
      "supplement-creatine", "supplement-whey", "supplement-bcaa", "supplement-eaa", "supplement-caffeine", "supplement-omega3",
      "supplement-multivitamin", "supplement-vitamin-d", "supplement-beta-alanine", "supplement-citrulline", "supplement-collagen",
      "supplement-ashwagandha", "supplement-nac", "supplement-hmb",
    ]) expect(topics).toContain(id);
  });

  it("topics with no verified source are explicit gaps, never records", () => {
    const gapTopics = KNOWLEDGE_GAPS.map((g) => g.topic.toLowerCase());
    for (const topic of ["taurine", "glucosamine", "coq10", "magnesium", "tudca"]) {
      expect(gapTopics).toContain(topic);
      expect(KNOWLEDGE_RECORDS.some((r) => r.topic.toLowerCase() === topic)).toBe(false);
    }
  });
});

describe("evidence granularity — strength belongs to claim x outcome x population x context", () => {
  it("creatine is not one grade: strong for high-intensity performance, only 'may' for recovery, not necessary", () => {
    const claims = record("supplement-creatine").claims;
    const performance = claims.find((c) => /high-intensity/.test(c.outcome))!;
    const recovery = claims.find((c) => /recovery/.test(c.outcome))!;
    const necessity = claims.find((c) => /necessity/.test(c.outcome))!;
    expect(performance.evidenceStrength).toBe("HIGH");
    expect(recovery.claimType).toBe("UNCERTAIN");
    expect(recovery.evidenceStrength).toBe("LIMITED");
    expect(necessity.stance).toBe("DOES_NOT_SUPPORT");
    expect(new Set(claims.map((c) => c.evidenceStrength)).size).toBeGreaterThan(1);
  });

  it("every claim names its outcome, population and context", () => {
    for (const r of KNOWLEDGE_RECORDS) for (const c of r.claims) {
      expect(c.outcome.length).toBeGreaterThan(3);
      expect(c.population.length).toBeGreaterThan(2);
      expect(c.context.length).toBeGreaterThan(3);
    }
  });

  it("MECHANISM != BENEFIT: a mechanism claim never counts as support for taking something", () => {
    expect(record("supplement-bcaa").claims.some((c) => c.claimType === "MECHANISM")).toBe(true);
    expect(strongestSupport(record("supplement-bcaa"))).toBeNull();
    // beta-alanine's carnosine mechanism is HIGH, but its usable support is the MODERATE, outcome-specific performance claim
    expect(record("supplement-beta-alanine").claims.find((c) => c.claimType === "MECHANISM")!.evidenceStrength).toBe("HIGH");
    expect(strongestSupport(record("supplement-beta-alanine"))).toBe("MODERATE");
  });

  it("POPULARITY != EVIDENCE: popular supplements with unsupported claims carry DOES_NOT_SUPPORT", () => {
    for (const id of ["supplement-bcaa", "supplement-hmb", "supplement-nac", "supplement-omega3", "supplement-collagen"]) {
      expect(record(id).claims.some((c) => c.stance === "DOES_NOT_SUPPORT")).toBe(true);
    }
  });

  it("conflicting evidence is recorded as conflict, not resolved by picking a side", () => {
    expect(record("supplement-hmb").claims.some((c) => /different conclusions/.test(c.uncertainty))).toBe(true);
    expect(record("training-cardio-interference").claims.some((c) => /disagree/.test(c.uncertainty))).toBe(true);
  });
});

describe("knowledge state model", () => {
  it("CANONICAL_KNOWLEDGE_AVAILABLE for a covered topic — and then no live retrieval", () => {
    const r = resolve("is creatine necessary?");
    expect(r.state).toBe("CANONICAL_KNOWLEDGE_AVAILABLE");
    expect(retrievalWarranted(r)).toBe(false);
  });

  it("RETRIEVAL_REQUIRED when the user asks for the evidence itself", () => {
    const r = resolve("what does the latest research say about creatine?");
    expect(r.state).toBe("RETRIEVAL_REQUIRED");
    expect(r.retrievalReasons).toContain("source_specificity_requested");
    expect(retrievalWarranted(r)).toBe(true);
  });

  it("a known gap retrieves when it can, and is KNOWLEDGE_INSUFFICIENT when it cannot", () => {
    expect(resolve("What does TUDCA do?", true).state).toBe("RETRIEVAL_REQUIRED");
    expect(resolve("What does TUDCA do?", false).state).toBe("KNOWLEDGE_INSUFFICIENT");
    expect(resolve("should I take taurine", false).gaps.map((g) => g.topic)).toEqual(["taurine"]);
  });

  it("external retrieval failure becomes uncertainty, not a confident fallback", () => {
    const required = resolve("What does TUDCA do?", true);
    expect(settleKnowledgeState(required, false).state).toBe("KNOWLEDGE_INSUFFICIENT");
    expect(settleKnowledgeState(required, true).state).toBe("RETRIEVAL_REQUIRED");
    // canonical knowledge still stands when only the extra retrieval came back empty
    expect(settleKnowledgeState(resolve("latest research on creatine?"), false).state).toBe("CANONICAL_KNOWLEDGE_AVAILABLE");
  });

  it("a policy-boundary topic is never retrieved for", () => {
    for (const message of ["should i take sarms", "give me a natural test booster"]) {
      const r = resolve(message, true);
      expect(r.state).toBe("KNOWLEDGE_INSUFFICIENT");
      expect(r.retrievalReasons).toContain("policy_boundary_topic");
    }
  });

  it("a turn with nothing to know leaves the layer silent (no state, existing behaviour untouched)", () => {
    for (const message of ["start today's workout", "thanks", "log 200g chicken for lunch"]) {
      const r = resolve(message);
      expect(r.state).toBeNull();
      expect(r.records).toEqual([]);
      expect(retrievalWarranted(r)).toBe(true);
    }
  });

  it("does not match a tag inside another word", () => {
    expect(ids("I had a snack before training")).not.toContain("supplement-nac");
    expect(ids("my shoulder is clicking")).toEqual([]);
  });

  it("an open request expands to the baseline set; a named one stays narrow", () => {
    const open = resolve("what supplements should i take");
    expect(open.openSupplementRequest).toBe(true);
    expect(open.records.map((r) => r.id)).toEqual(expect.arrayContaining(["supplement-principles", "supplement-creatine", "supplement-whey", "supplement-bcaa", "supplement-caffeine", "supplement-omega3", "supplement-multivitamin", "supplement-vitamin-d"]));
    const named = resolve("should I take creatine supplements?");
    expect(named.openSupplementRequest).toBe(false);
    expect(named.records.map((r) => r.id)).toEqual(["supplement-creatine", "supplement-principles"]);
  });

  it("a short follow-up continues the previous user topic", () => {
    expect(resolve("is it necessary?", true, ["tell me about creatine"]).records.map((r) => r.id)).toContain("supplement-creatine");
    expect(resolve("in english bro", true, ["nên tập tới thất bại mỗi set không"]).records.map((r) => r.id)).toContain("training-failure");
  });

  it("Vietnamese wording reaches the same records", () => {
    expect(ids("dầu cá có cần không")).toContain("supplement-omega3");
    expect(ids("có nên giảm tải tuần này")).toContain("training-deload-fatigue");
  });
});
