import { describe, expect, it } from "vitest";

import { classifySupplementClaim, screenSafety, supplementEducationReply } from "@/lib/nutrition/coach/orchestration/safety";

import {
  acceptIntegrityRetry,
  buildAnswerTrace,
  buildIntelligenceBrief,
  calibrateEvidenceWording,
  claimEvidenceScopes,
  completeObligations,
  deriveObligations,
  enforceIntegrity,
  knowledgeEvidenceLine,
  obligationDisposition,
  resolveKnowledge,
  retrievalWarranted,
  settleBrief,
  settleKnowledgeState,
  stripModelAuthoredSources,
} from "..";

const brief = (message: string) => buildIntelligenceBrief({ message, coach: "DANTE", canRetrieve: true });
const resolve = (message: string, canRetrieve = true) => resolveKnowledge({ message, canRetrieve });

const DEFINE = ["What is TUDCA?", "What is CoQ10?", "What is taurine?", "What is creatine?", "What is NAC?"] as const;
const EVIDENCE = ["Does glutamine build muscle?", "Does taurine improve recovery?", "Is TUDCA proven to protect the liver?"] as const;

describe("answer obligations", () => {
  it.each(DEFINE)("DEFINE stays a define question: %s", (message) => {
    expect(deriveObligations(message)).toEqual(["DEFINE"]);
    expect(deriveObligations(message)).not.toEqual(deriveObligations("Does glutamine build muscle?"));
    expect(deriveObligations(message)).not.toEqual(deriveObligations("What TUDCA dose protects my liver on cycle?"));
  });

  it.each(EVIDENCE)("evidence questions ask for evidence: %s", (message) => {
    expect(deriveObligations(message)).toContain("ASSESS_EVIDENCE");
    expect(deriveObligations(message)).not.toContain("DEFINE");
  });

  it("a disclaimer alone is not a completed definition", () => {
    const turn = brief("What is creatine?");
    expect(obligationDisposition("DEFINE", "Ask your doctor before you take anything.", turn)).toBeNull();
    const completed = completeObligations("Ask your doctor before you take anything.", "What is creatine?", turn);
    expect(completed.missing).not.toContain("DEFINE");
    expect(completed.reply).toMatch(/^Creatine is a compound the body makes/);
  });

  it("keeps define and compare when a symptom is in the same turn", () => {
    const kinds = deriveObligations("What is TUDCA, is it better than NAC, and my eyes look yellow?");
    expect(kinds).toContain("DEFINE");
    expect(kinds).toContain("COMPARE");
  });
});

describe("entity status", () => {
  it.each(["What is TUDCA?", "What is CoQ10?", "What is taurine?", "What is creatine?", "What is NAC?"])("%s resolves the name", (message) => {
    const found = resolve(message, false);
    expect(found.entityStatus).toBe("KNOWN");
    expect(found.state).not.toBeNull();
  });

  it("an unknown product is an explicit state", () => {
    const found = resolve("What is xyzabc supplement?");
    expect(found.entityStatus).toBe("UNKNOWN_ENTITY");
    expect(found.state).toBe("KNOWLEDGE_INSUFFICIENT");
    expect(found.records).toEqual([]);
    expect(retrievalWarranted(found)).toBe(false);
    const completed = completeObligations("xyzabc is a bile acid that protects the liver.", "What is xyzabc supplement?", brief("What is xyzabc supplement?"));
    expect(completed.reply).toMatch(/can't confidently identify/i);
    expect(completed.reply).not.toMatch(/bile acid/);
    expect(completed.missing).not.toContain("DEFINE");
  });

  it("a known name beside an unknown product keeps the known record", () => {
    const found = resolve("Compare creatine with xyzabc supplement");
    expect(found.records.some((record) => record.id === "supplement-creatine")).toBe(true);
    expect(found.unresolvedEntities).toContain("xyzabc");
    const completed = completeObligations("Creatine is useful.", "Compare creatine with xyzabc supplement", brief("Compare creatine with xyzabc supplement"));
    expect(completed.reply).toMatch(/can't confidently identify xyzabc/i);
  });

  it("asks for a variant only when the question needs one", () => {
    expect(resolve("What is TUDCA?").entityStatus).toBe("KNOWN");
    expect(resolve("What ingredients are in TUDCA?").entityStatus).toBe("VARIANT_REQUIRED");
  });

  it("an unsure product name is ambiguous", () => {
    expect(resolve("I'm not sure which TUDCA").entityStatus).toBe("AMBIGUOUS_ENTITY");
  });
});

describe("fused identity and benefit", () => {
  const fused = "TUDCA is a bile acid that may protect the liver. Therefore it is the better option.";

  it("keeps the identity, drops the benefit and the conclusion that depends on it", () => {
    const out = enforceIntegrity(fused, brief("What is TUDCA?"), "en");
    expect(out).toMatch(/TUDCA is a bile acid/);
    expect(out).not.toMatch(/protect/);
    expect(out).not.toMatch(/better option/);
  });

  it("the education pass uses the same span repair", () => {
    const { reply, removed } = supplementEducationReply(fused, "What is TUDCA?");
    expect(removed).toBeGreaterThan(0);
    expect(reply).toMatch(/TUDCA is a bile acid/);
    expect(reply).not.toMatch(/protect the liver/);
    expect(reply).not.toMatch(/better option/);
  });

  it("running both passes still leaves the identity", () => {
    const educated = supplementEducationReply(fused, "What is TUDCA?").reply;
    const out = enforceIntegrity(educated, brief("What is TUDCA?"), "en");
    expect(out).toMatch(/TUDCA is a bile acid/);
    expect(out).not.toMatch(/protect the liver/);
  });
});

describe("evidence state does not collapse", () => {
  const required = () => resolve("What does TUDCA do?", true);

  it("an empty search is a corpus miss, not a failed search and not a refutation", () => {
    const empty = settleKnowledgeState(required(), false);
    expect(empty.state).toBe("KNOWLEDGE_INSUFFICIENT");
    expect(empty.retrievalStatus).toBe("SUCCESS");
    expect(empty.coverage).toBe("NO_MATCH_IN_SEARCHED_CORPUS");
    expect(empty.evidenceConclusion).toBe("UNKNOWN");
    expect(knowledgeEvidenceLine(empty)).toMatch(/not a finding/i);
    const said = calibrateEvidenceWording("TUDCA is a bile acid. There is no scientific evidence it works.", briefOf(empty));
    expect(said).toMatch(/TUDCA is a bile acid/);
    expect(said).not.toMatch(/there is no scientific evidence/i);
  });

  it("returned evidence for a gap is indirect, not a canonical proof", () => {
    const found = settleKnowledgeState(required(), true);
    expect(found.retrievalStatus).toBe("SUCCESS");
    expect(found.coverage).toBe("INDIRECT");
    expect(found.state).toBe("RETRIEVAL_REQUIRED");
  });

  it("a failed search stays failed", () => {
    const failed = settleKnowledgeState(required(), false, "FAILED");
    expect(failed.retrievalStatus).toBe("FAILED");
    expect(failed.coverage).toBe("NOT_ASSESSED");
    expect(failed.evidenceConclusion).toBe("UNKNOWN");
    expect(knowledgeEvidenceLine(failed)).toMatch(/did not finish/i);
    const said = calibrateEvidenceWording("There is no evidence TUDCA works. TUDCA is a bile acid.", briefOf(failed));
    expect(said).toMatch(/could not finish the evidence check/i);
    expect(said).toMatch(/TUDCA is a bile acid/);
    expect(said).not.toMatch(/there is no evidence/i);
  });

  it("a gap beside a canonical record does not wipe the record", () => {
    const mixed = settleKnowledgeState(resolve("Compare creatine and glutamine", true), false);
    expect(mixed.retrievalStatus).toBe("PARTIAL");
    expect(mixed.records.some((record) => record.id === "supplement-creatine")).toBe(true);
    expect(knowledgeEvidenceLine(mixed)).toMatch(/still stand/i);
  });

  it("claim scopes stay separate", () => {
    const scopes = claimEvidenceScopes(resolve("What is NAC?"));
    expect(scopes.some((scope) => scope.outcome === "sport performance" && scope.conclusion === "INSUFFICIENT")).toBe(true);
    expect(scopes.some((scope) => /organ protection/.test(scope.outcome) && scope.conclusion === "UNKNOWN")).toBe(true);
  });

  it("a record with disagreeing claims is conflicting on that claim only", () => {
    const scopes = claimEvidenceScopes(resolve("What is HMB?"));
    expect(scopes.some((scope) => scope.conclusion === "CONFLICTING")).toBe(true);
    expect(scopes.some((scope) => scope.conclusion === "INSUFFICIENT")).toBe(true);
  });
});

describe("safety boundaries stay stops", () => {
  it.each([
    "What TUDCA dose protects my liver on cycle?",
    "Give me a liver-protection stack for my cycle.",
    "What NAC dose should protect my organs on steroids?",
  ])("%s does not become ordinary education", (message) => {
    const screen = screenSafety(message);
    expect(screen).not.toBeNull();
    expect(["ESCALATE", "SAFE_REDIRECT", "REFUSE_POLICY"]).toContain(screen?.mode);
  });

  it("evidence and dose on the same name are different contracts", () => {
    expect(classifySupplementClaim("Does TUDCA protect the liver?")?.intent).toBe("TREATMENT_OUTCOME");
    expect(classifySupplementClaim("What TUDCA dose protects my liver on cycle?")?.intent).toBe("DOSING");
    expect(deriveObligations("Does taurine improve recovery?")).toContain("ASSESS_EVIDENCE");
    expect(deriveObligations("What taurine dose should I take?")).not.toContain("ASSESS_EVIDENCE");
  });
});

describe("compare, unknown, and non-supplement controls", () => {
  it("compare of two known names is not an unknown-entity turn", () => {
    expect(resolve("Compare TUDCA and NAC").entityStatus).toBe("KNOWN");
    expect(resolve("Compare creatine and glutamine").entityStatus).toBe("KNOWN");
    const completed = completeObligations("Both are supplements.", "Compare TUDCA and NAC", brief("Compare TUDCA and NAC"));
    expect(completed.reply).toMatch(/won't rank/i);
  });

  it("compare against an unnamed product asks, and does not invent the missing side", () => {
    const completed = completeObligations("TUDCA is better.", "Compare TUDCA and an unknown product.", brief("Compare TUDCA and an unknown product."));
    expect(completed.reply).toMatch(/can't confidently identify/i);
    expect(completed.reply).not.toMatch(/TUDCA is better/);
  });

  it("RPE stays a training definition", () => {
    const found = resolve("What is RPE?");
    expect(found.records.some((record) => record.id === "training-rir-rpe")).toBe(true);
    expect(found.entityStatus).not.toBe("UNKNOWN_ENTITY");
    expect(supplementEducationReply("RPE is a way to rate how hard a set is.", "What is RPE?")).toEqual({
      reply: "RPE is a way to rate how hard a set is.",
      removed: 0,
    });
  });

  it("deloading stays out of the supplement rewriter", () => {
    expect(deriveObligations("Does deloading improve recovery?")).toContain("ASSESS_EVIDENCE");
    expect(screenSafety("Does deloading improve recovery?")).toBeNull();
    expect(supplementEducationReply("A deload reduces training stress for a short period.", "Does deloading improve recovery?").removed).toBe(0);
  });
});

describe("metamorphic contracts", () => {
  it("swapping the named gap keeps the define class", () => {
    expect(deriveObligations("What is TUDCA?")).toEqual(deriveObligations("What is CoQ10?"));
    expect(resolve("What is TUDCA?", false).entityStatus).toBe(resolve("What is CoQ10?", false).entityStatus);
  });

  it("retrieval wording changes and an independent identity sentence stays", () => {
    const turn = brief("What does TUDCA do?");
    const settled = settleBrief(turn, { message: "What does TUDCA do?", coach: "DANTE", canRetrieve: true }, false);
    const said = calibrateEvidenceWording("TUDCA is a bile acid. There is no scientific evidence for a benefit.", { ...turn, knowledge: settled.knowledge });
    expect(said).toMatch(/TUDCA is a bile acid/);
    expect(said).not.toMatch(/there is no scientific evidence/i);
    expect(settled.knowledge.coverage).toBe("NO_MATCH_IN_SEARCHED_CORPUS");
  });

  it("Vietnamese changes the wording and not the obligation or the stop", () => {
    expect(deriveObligations("TUDCA là gì?")).toContain("DEFINE");
    expect(deriveObligations("What is TUDCA?")).toContain("DEFINE");
    expect(screenSafety("TUDCA là gì?")).toBeNull();
    expect(screenSafety("What is TUDCA?")).toBeNull();
    expect(classifySupplementClaim("TUDCA là gì?")?.intent).toBe("GENERAL_EDUCATION");
    expect(classifySupplementClaim("What is TUDCA?")?.intent).toBe("GENERAL_EDUCATION");
  });

  it("a known entity and an unknown entity do not share a disposition", () => {
    const known = completeObligations("TUDCA is a bile acid.", "What is TUDCA?", brief("What is TUDCA?"));
    const unknown = completeObligations("xyzabc is a bile acid.", "What is xyzabc supplement?", brief("What is xyzabc supplement?"));
    expect(known.reply).toMatch(/bile acid/);
    expect(unknown.reply).not.toMatch(/bile acid/);
    expect(obligationDisposition("DEFINE", known.reply, brief("What is TUDCA?"))).toBe("ANSWERED");
    expect(obligationDisposition("DEFINE", unknown.reply, brief("What is xyzabc supplement?"))).toBe("NEEDS_CLARIFICATION");
  });
});

describe("sources and trace", () => {
  it("drops a model-written source section and a raw svg, and leaves the answer", () => {
    const reply = 'TUDCA is a bile acid.\n\nSources (1)\n- [Fake paper](https://example.com)\n<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
    const cleaned = stripModelAuthoredSources(reply);
    expect(cleaned).toMatch(/TUDCA is a bile acid/);
    expect(cleaned).not.toMatch(/Sources \(1\)/);
    expect(cleaned).not.toMatch(/example\.com/);
    expect(cleaned).not.toMatch(/<svg/);
  });

  it("drops a 'Sources checked' heading the old prompt asked for, but keeps prose that mentions a source", () => {
    const cleaned = stripModelAuthoredSources("A good source of protein is eggs.\n\n**Sources checked:**\n- Made-up review (2020)");
    expect(cleaned).toBe("A good source of protein is eggs.");
  });

  it("records the repair fields without a none bucket", () => {
    const turn = brief("What is TUDCA?");
    const trace = buildAnswerTrace({ message: "What is TUDCA?", brief: turn, violationCodes: [], missing: [], retryCount: 0 });
    expect(trace.questionTypes).toEqual(["DEFINE"]);
    expect(trace.entityStatus).toBe("KNOWN");
    expect(trace.violationCodes).toEqual(["ASSESSED_NONE"]);
    expect(trace.missingObligationIds).toEqual(["ASSESSED_NONE"]);
    expect(trace.retrievalStatus).not.toBe("NONE");
    expect(JSON.stringify(trace)).not.toMatch(/"NONE"/);
  });
});

describe("retry keeps the more complete draft", () => {
  it("accepts a retry that holds the violation count and answers more", () => {
    expect(acceptIntegrityRetry({ previousViolations: 1, nextViolations: 1, nextHasNewCode: false, previousCompleteness: 0, nextCompleteness: 1 })).toBe(true);
  });

  it("rejects a retry that deletes a satisfied obligation or adds a code", () => {
    expect(acceptIntegrityRetry({ previousViolations: 1, nextViolations: 0, nextHasNewCode: false, previousCompleteness: 1, nextCompleteness: 0 })).toBe(false);
    expect(acceptIntegrityRetry({ previousViolations: 1, nextViolations: 1, nextHasNewCode: true, previousCompleteness: 0, nextCompleteness: 1 })).toBe(false);
  });
});

function briefOf(knowledge: ReturnType<typeof resolve>): ReturnType<typeof brief> {
  const turn = brief("What does TUDCA do?");
  return { ...turn, knowledge };
}
