import { describe, expect, it } from "vitest";
import {
  canActAsMutationTruth,
  canPromoteHypothesis,
  classifyIdentifiability,
  deriveClaimLedger,
  deriveUncertaintyClass,
  findCounterEvidence,
  fromDanteEvidenceKind,
  fromDanteProvenance,
  fromExistingConfidence,
  fromGemmaDraftStatus,
  fromGemmaSource,
  fromRetrievalMetadata,
  mergeEvidenceWithoutLosingProvenance,
  rankEvidence,
  type EvidenceItem,
  type Hypothesis,
} from "../index";

const ev = (o: Partial<EvidenceItem> & { id: string }): EvidenceItem => ({
  origin: "VERIFIED_STATE",
  verification: "VERIFIED",
  direction: "FOR",
  strength: "STRONG",
  summary: o.id,
  sourceRefs: [],
  ...o,
});

const hyp = (o: Partial<Hypothesis> = {}): Hypothesis => ({
  id: "h1",
  domain: "recovery",
  question: "q",
  candidateExplanation: "poor sleep drives low readiness",
  supportingEvidence: [ev({ id: "s1", hypothesisId: "h1" })],
  counterEvidence: [],
  missingEvidence: [],
  counterEvidenceEvaluated: true,
  identifiability: "IDENTIFIED",
  uncertainty: "HIGH_SUPPORT",
  status: "PLAUSIBLE",
  ...o,
});

describe("evidence ranking", () => {
  it("user correction outranks prior inference", () => {
    const r = rankEvidence([ev({ id: "a", origin: "PRIOR_INFERENCE" }), ev({ id: "b", origin: "USER_CORRECTION" })]);
    expect(r[0].id).toBe("b");
  });
  it("fresh verified outranks stale inferred and stale verified", () => {
    const r = rankEvidence([
      ev({ id: "stale", stale: true }),
      ev({ id: "inf", origin: "MODEL_INFERENCE", verification: "UNRESOLVED" }),
      ev({ id: "fresh" }),
    ]);
    expect(r.map((x) => x.id)).toEqual(["fresh", "inf", "stale"]);
  });
  it("deterministic result outranks unsupported model inference", () => {
    const r = rankEvidence([ev({ id: "m", origin: "MODEL_INFERENCE" }), ev({ id: "d", origin: "DETERMINISTIC_RESULT" })]);
    expect(r[0].id).toBe("d");
  });
});

describe("verification status", () => {
  it("estimated and unresolved are never verified; proposed/simulated never mutation truth", () => {
    expect(fromGemmaSource("VERIFIED", true)).toBe("ESTIMATED");
    expect(fromGemmaSource("ESTIMATED", false)).toBe("ESTIMATED");
    expect(fromGemmaSource("UNKNOWN", false)).toBe("UNRESOLVED");
    expect(fromGemmaDraftStatus("CONFIRMED", false)).toBe("PROPOSED");
    expect(fromGemmaDraftStatus("LOGGED", true)).toBe("ESTIMATED");
    for (const v of ["ESTIMATED", "UNRESOLVED", "PROPOSED", "SIMULATED"] as const) {
      expect(canActAsMutationTruth(v)).toBe(false);
    }
    expect(canActAsMutationTruth("VERIFIED")).toBe(true);
  });
  it("merge never upgrades estimated to verified", () => {
    const m = mergeEvidenceWithoutLosingProvenance(
      [ev({ id: "x", verification: "ESTIMATED", sourceRefs: ["a"] })],
      [ev({ id: "x", verification: "VERIFIED", sourceRefs: ["b"] })],
    );
    expect(m).toHaveLength(1);
    expect(m[0].verification).toBe("ESTIMATED");
  });
});

describe("merge", () => {
  it("contradictory evidence survives with provenance", () => {
    const m = mergeEvidenceWithoutLosingProvenance(
      [ev({ id: "x", direction: "FOR", sourceRefs: ["a"] })],
      [ev({ id: "x", direction: "AGAINST", sourceRefs: ["b"] }), ev({ id: "x", direction: "FOR", sourceRefs: ["c"] })],
    );
    expect(m).toHaveLength(2);
    expect(m.find((i) => i.direction === "FOR")?.sourceRefs.sort()).toEqual(["a", "c"]);
    expect(m.find((i) => i.direction === "AGAINST")?.sourceRefs).toEqual(["b"]);
  });
});

describe("identifiability", () => {
  const strong = (id: string) => ev({ id });
  const weakInf = (id: string) => ev({ id, origin: "MODEL_INFERENCE", strength: "WEAK" });
  it("similar support across explanations is UNDERDETERMINED", () => {
    expect(
      classifyIdentifiability([
        { id: "a", support: [strong("1")], counter: [] },
        { id: "b", support: [strong("2")], counter: [] },
      ]),
    ).toBe("UNDERDETERMINED");
  });
  it("strong support and strong counter on same explanation is CONFLICTING", () => {
    expect(classifyIdentifiability([{ id: "a", support: [strong("1")], counter: [strong("2")] }])).toBe("CONFLICTING");
  });
  it("one supported with alternatives refuted is IDENTIFIED; missing critical evidence weakens it", () => {
    const set = [
      { id: "a", support: [strong("1")], counter: [] },
      { id: "b", support: [], counter: [strong("2")] },
    ];
    expect(classifyIdentifiability(set)).toBe("IDENTIFIED");
    expect(classifyIdentifiability(set, { criticalEvidenceMissing: true })).toBe("PARTIALLY_IDENTIFIED");
  });
  it("no evidence is UNKNOWN; unrefuted alternatives block IDENTIFIED", () => {
    expect(classifyIdentifiability([{ id: "a", support: [], counter: [] }])).toBe("UNKNOWN");
    expect(
      classifyIdentifiability([
        { id: "a", support: [strong("1")], counter: [] },
        { id: "b", support: [], counter: [] },
      ]),
    ).toBe("PARTIALLY_IDENTIFIED");
    expect(classifyIdentifiability([{ id: "a", support: [weakInf("w")], counter: [] }])).toBe("PARTIALLY_IDENTIFIED");
  });
});

describe("uncertainty", () => {
  it("non-identifiability increases uncertainty; missing evidence weakens further", () => {
    const order = ["HIGH_SUPPORT", "MODERATE_SUPPORT", "WEAK_SUPPORT", "UNRESOLVED"];
    const u = (s: Parameters<typeof deriveUncertaintyClass>[0]) => order.indexOf(deriveUncertaintyClass(s));
    expect(u("IDENTIFIED")).toBeLessThan(u("PARTIALLY_IDENTIFIED"));
    expect(u("PARTIALLY_IDENTIFIED")).toBeLessThan(u("UNDERDETERMINED"));
    expect(u("UNDERDETERMINED")).toBeLessThan(u("CONFLICTING"));
    expect(deriveUncertaintyClass("IDENTIFIED", { missingEvidence: true })).toBe("MODERATE_SUPPORT");
  });
});

describe("hypothesis promotion", () => {
  it("is blocked without an explicit counter-evidence check", () => {
    const d = canPromoteHypothesis(hyp({ counterEvidenceEvaluated: false }), "SUPPORTED");
    expect(d.allowed).toBe(false);
    expect(d.reasons).toContain("COUNTER_EVIDENCE_NOT_EVALUATED");
  });
  it("findCounterEvidence marks the check and surfaces AGAINST items; strong counter blocks promotion", () => {
    const pool = [ev({ id: "c", direction: "AGAINST", hypothesisId: "h1" }), ev({ id: "o", direction: "AGAINST", hypothesisId: "other" })];
    const r = findCounterEvidence("h1", pool);
    expect(r.evaluated).toBe(true);
    expect(r.counterEvidence.map((i) => i.id)).toEqual(["c"]);
    const d = canPromoteHypothesis(hyp({ counterEvidence: r.counterEvidence }), "SUPPORTED");
    expect(d.reasons).toContain("COUNTER_EVIDENCE_NOT_OUTWEIGHED");
  });
  it("unsupported (inference-only) hypothesis cannot become IDENTIFIED", () => {
    const h = hyp({ supportingEvidence: [ev({ id: "m", origin: "MODEL_INFERENCE", verification: "UNRESOLVED" })] });
    const d = canPromoteHypothesis(h, "IDENTIFIED");
    expect(d.allowed).toBe(false);
    expect(d.reasons).toContain("NO_GROUNDED_SUPPORT");
  });
  it("grounded, checked, identified, no missing evidence may be IDENTIFIED; underdetermined may not", () => {
    expect(canPromoteHypothesis(hyp(), "IDENTIFIED").allowed).toBe(true);
    expect(canPromoteHypothesis(hyp({ identifiability: "UNDERDETERMINED" }), "IDENTIFIED").allowed).toBe(false);
    expect(canPromoteHypothesis(hyp({ identifiability: "UNDERDETERMINED" }), "SUPPORTED").allowed).toBe(true);
  });
});

describe("adapters and ledger", () => {
  it("map Dante kinds/provenance/confidence without losing meaning", () => {
    expect(fromDanteEvidenceKind("system_fact")).toBe("VERIFIED_STATE");
    expect(fromDanteEvidenceKind("model_inference")).toBe("MODEL_INFERENCE");
    expect(fromDanteProvenance("EXPLICIT_HISTORICAL_REPORT")).toEqual({ origin: "USER_EXPLICIT", stale: true });
    expect(fromExistingConfidence("high")).toBe("HIGH_SUPPORT");
    expect(fromExistingConfidence("MIXED")).toBe("WEAK_SUPPORT");
    expect(fromExistingConfidence("NONE")).toBe("UNRESOLVED");
  });
  it("retrieval metadata survives as sourceRefs", () => {
    expect(fromRetrievalMetadata({ docId: "d", sectionId: "s" })).toEqual({ origin: "RETRIEVED_KNOWLEDGE", sourceRefs: ["d", "s"] });
    expect(fromRetrievalMetadata({}).origin).toBe("UNKNOWN");
  });
  it("ledger never labels simulation as fact or hypothesis as verified", () => {
    const l = deriveClaimLedger([ev({ id: "sim", origin: "SIMULATION", verification: "SIMULATED" })], [hyp()]);
    expect(l.find((c) => c.id === "claim:sim")).toMatchObject({ claimType: "PROPOSAL", verification: "SIMULATED" });
    expect(l.find((c) => c.claimType === "HYPOTHESIS")?.verification).toBe("UNRESOLVED");
  });
});
