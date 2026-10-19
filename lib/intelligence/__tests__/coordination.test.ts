import { describe, expect, it } from "vitest";
import {
  canActAsMutationTruth,
  canImplicationAuthorizeMutation,
  coachSignalAuthority,
  coachSignalToClaim,
  compareSignalAuthority,
  createCoachHandoff,
  evaluateCrossDomainRelevance,
  isCoachSignalActive,
  projectSignalForTarget,
  representConflict,
  type CoachSignal,
} from "../index";

const now = new Date("2026-10-12T12:00:00Z");
const sig = (o: Partial<CoachSignal> = {}): CoachSignal => ({
  id: "s1",
  schemaVersion: 1,
  idempotencyKey: "k-s1",
  userScope: "scope-A",
  privacyClass: "NORMAL",
  lifecycle: "ACTIVE",
  sourceCoach: "DANTE",
  sourceDomain: "RECOVERY",
  signalType: "LOW_RECOVERY",
  status: "CROSS_COACH_VERIFIED",
  evidenceRefs: ["e1"],
  uncertainty: "MODERATE_SUPPORT",
  identifiability: "PARTIALLY_IDENTIFIED",
  validFrom: "2026-10-12T00:00:00Z",
  validUntil: "2026-10-13T00:00:00Z",
  implications: [
    { targetDomain: "NUTRITION", type: "RECOMMENDATION_CONTEXT", value: "AVOID_AGGRESSIVE_DEFICIT", relevance: "MATERIAL" },
  ],
  provenance: ["dante:readiness"],
  ...o,
});
const STATUSES = ["CROSS_COACH_VERIFIED", "SUPPORTED_HYPOTHESIS", "INFERENCE", "HEURISTIC"] as const;
const handoffBase = {
  id: "h1",
  idempotencyKey: "k-h1",
  userScope: "scope-A",
  fromCoach: "DANTE",
  toCoach: "GEMMA",
  reason: "LOW_RECOVERY",
  requestedCapability: "ADAPT_MEAL_STRATEGY",
} as const;

describe("coach coordination contract", () => {
  it("expired / not-yet-valid / malformed signals are inactive", () => {
    expect(isCoachSignalActive(sig(), now)).toBe(true);
    expect(isCoachSignalActive(sig({ validUntil: "2026-10-12T12:00:00Z" }), now)).toBe(false);
    expect(isCoachSignalActive(sig({ validFrom: "2026-10-12T13:00:00Z" }), now)).toBe(false);
    expect(isCoachSignalActive(sig({ validUntil: "garbage" }), now)).toBe(false);
  });

  it("a coach signal never becomes VERIFIED_FACT / mutation truth", () => {
    for (const status of STATUSES) {
      const claim = coachSignalToClaim(sig({ status }));
      expect(claim.claimType).not.toBe("VERIFIED_FACT");
      expect(canActAsMutationTruth(claim.verification)).toBe(false);
    }
  });

  it("authority: safety > deterministic > state > user > coach signal > hypothesis > inference > heuristic", () => {
    const coach = coachSignalAuthority(sig());
    expect(compareSignalAuthority("DETERMINISTIC_TRUTH", coach)).toBeGreaterThan(0);
    expect(compareSignalAuthority("USER_EXPLICIT", coachSignalAuthority(sig({ status: "INFERENCE" })))).toBeGreaterThan(0);
    expect(compareSignalAuthority("USER_EXPLICIT", coach)).toBeGreaterThan(0);
    expect(compareSignalAuthority("CURRENT_VERIFIED_ATHLETE_STATE", "USER_EXPLICIT")).toBeGreaterThan(0);
    for (const status of STATUSES) {
      expect(compareSignalAuthority("SAFETY", coachSignalAuthority(sig({ status })))).toBeGreaterThan(0);
    }
    expect(compareSignalAuthority("INFERENCE", "INFERENCE")).toBe(0);
  });

  it("implications never authorize mutation (Dante→nutrition, Gemma→training)", () => {
    const toNutrition = sig().implications[0];
    const toTraining = { ...toNutrition, targetDomain: "TRAINING" as const };
    expect(canImplicationAuthorizeMutation(toNutrition).allowed).toBe(false);
    expect(canImplicationAuthorizeMutation(toTraining).allowed).toBe(false);
  });

  it("provenance and evidence refs survive projection, filtered to the target", () => {
    const mixed = sig({
      implications: [...sig().implications, { targetDomain: "TRAINING", type: "CAUTION", value: "X", relevance: "OPTIONAL" }],
    });
    const p = projectSignalForTarget(mixed, "GEMMA");
    expect(p.provenance).toEqual(["dante:readiness"]);
    expect(p.evidenceRefs).toEqual(["e1"]);
    expect(p.sourceCoach).toBe("DANTE");
    expect(p.implications.map((i) => i.targetDomain)).toEqual(["NUTRITION"]);
  });

  it("irrelevant signals are excluded; material ones can be handed off", () => {
    const own = sig({ implications: [{ targetDomain: "TRAINING", type: "CAUTION", value: "X", relevance: "CRITICAL" }] });
    expect(evaluateCrossDomainRelevance(own, "GEMMA", now)).toBe("IRRELEVANT");
    expect(evaluateCrossDomainRelevance(sig({ validUntil: "2026-10-12T01:00:00Z" }), "GEMMA", now)).toBe("IRRELEVANT");
    expect(createCoachHandoff({ ...handoffBase, signals: [own] }, now)).toBeNull();
    const h = createCoachHandoff({ ...handoffBase, signals: [own, sig()] }, now);
    expect(h?.signalIds).toEqual(["s1"]);
    expect(h?.expiresAt).toBe("2026-10-13T00:00:00.000Z");
  });

  it("handoff carries structured refs only — no conversation payload", () => {
    const h = createCoachHandoff({ ...handoffBase, signals: [sig()] }, now)!;
    expect(Object.keys(h).sort()).toEqual(
      ["createdAt", "expiresAt", "fromCoach", "id", "idempotencyKey", "privacyClass", "reason", "requestedCapability", "schemaVersion", "signalIds", "toCoach", "userScope"],
    );
  });

  it("cross-domain conflicts stay representable and the source coach does not win", () => {
    const c = representConflict("CONFLICT", "NUTRITION", ["s1"], ["calorie_target_nearly_exhausted"]);
    expect(c.winner).toBeNull();
    expect(c.resolvedBy).toBe("GEMMA");
    expect(c.signalIds).toEqual(["s1"]);
  });
});
