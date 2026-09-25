import { describe, expect, it } from "vitest";
import {
  applyHardSafetySurfaceContract,
  assertNoMetadataLeak,
  canonicalizeCausalTarget,
  canonicalizeRecommendationCode,
  computeResponseFingerprint,
  defaultPersonaContract,
  finalizeDanteResponse,
  mapBranchToFinalizerIntent,
  normalizeForFingerprint,
} from "@/lib/dante-core/runtime-convergence";
import { buildDanteDecision, interpretUserTurn } from "@/lib/dante-core/adaptive-coach-v2";

const FIXED_TS = "2026-09-19T04:00:00.000Z";

describe("Phase 1 — normalizeForFingerprint", () => {
  it("keeps Vietnamese diacritics and strips punctuation/emoji", () => {
    expect(normalizeForFingerprint("Chưa đâu, bro — sleep chưa nhận hết công 😏")).toBe(
      "chưa đâu bro sleep chưa nhận hết công",
    );
  });
});

describe("Phase 1 — canonical codes", () => {
  it("canonicalizes recommendation and causal targets", () => {
    expect(canonicalizeRecommendationCode("stop current set")).toBe("STOP_CURRENT_SET");
    expect(canonicalizeCausalTarget("giấc ngủ")).toBe("SLEEP");
    expect(canonicalizeCausalTarget("Sleep")).toBe("SLEEP");
    expect(canonicalizeCausalTarget(undefined)).toBeNull();
  });
});

describe("Phase 1 — fingerprint determinism", () => {
  it("is byte-stable for identical inputs", () => {
    const input = {
      sourceBranch: "SOCIAL" as const,
      responseIntent: "SOCIAL_RESPONSE" as const,
      rationaleCodes: ["VOLUME_CONFOUNDER", "ALCOHOL_CONFOUNDER"],
      recommendationCode: null,
      causalTarget: "SLEEP",
      safetySurfaceClass: "NONE" as const,
      normalizedText: normalizeForFingerprint("Chưa được. Sleep chưa nhận hết công."),
    };
    const a = computeResponseFingerprint(input);
    const b = computeResponseFingerprint({
      ...input,
      rationaleCodes: ["ALCOHOL_CONFOUNDER", "VOLUME_CONFOUNDER"], // order independent
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("Phase 1 — finalizeDanteResponse", () => {
  const baseInput = () => {
    const interpretation = interpretUserTurn("ok");
    const decision = buildDanteDecision({
      interpretation,
      tool: { permission: "CONFIRMATION_REQUIRED", persisted: false },
      claimConstraints: {
        persisted: false,
        episodeCount: "UNKNOWN",
        laterality: "UNCERTAIN",
        sleepCausality: "NOT_ESTABLISHED",
        currentChestPain: "ABSENT",
      },
    });
    return {
      draft: "Tôi đã lưu thay đổi. Ông đã bị 5 lần. Sleep tốt hơn chính là nguyên nhân.",
      decisionObject: decision,
      semanticState: interpretation,
      contextCapsule: null,
      personaContract: defaultPersonaContract("vi"),
      routeMetadata: { sourceBranch: "NORMAL_PROVIDER" as const, timestamp: FIXED_TS },
      discourseState: { rationaleCodes: ["SLEEP_NOT_ISOLATED"] },
      toolState: { permission: "CONFIRMATION_REQUIRED" as const, persisted: false },
      recommendationCode: null,
      causalTarget: "SLEEP",
    };
  };

  it("is idempotent and side-effect free", () => {
    const input = baseInput();
    const a = finalizeDanteResponse(input);
    const b = finalizeDanteResponse(input);
    expect(a.response).toBe(b.response);
    expect(a.audit).toEqual(b.audit);
    expect(a.audit.routeMetadata.responseFingerprint).toBe(b.audit.routeMetadata.responseFingerprint);
    expect(a.audit.controlPlaneMutated).toBe(false);
    expect(a.audit.externalSideEffects).toBe(false);
    expect(a.audit.routeMetadata.timestamp).toBe(FIXED_TS);
    expect(a.audit.routeMetadata.finalizerApplied).toBe(true);
    expect(a.audit.routeMetadata.hardSafetyBypass).toBe(false);
    expect(a.audit.personaContractReceived).toBe(true);
  });

  it("does not progressively distort on re-finalize", () => {
    const input = baseInput();
    const a = finalizeDanteResponse(input);
    const c = finalizeDanteResponse({ ...input, draft: a.response });
    expect(c.response).toBe(a.response);
  });

  it("never leaks route metadata into visible text", () => {
    const result = finalizeDanteResponse(baseInput());
    expect(assertNoMetadataLeak(result.response)).toBe(true);
    expect(result.response).not.toMatch(/responseFingerprint|finalizerApplied|hardSafetyBypass/);
  });

  it("preserves naturalization without inventing causality", () => {
    const result = finalizeDanteResponse(baseInput());
    expect(result.response).not.toMatch(/chính là nguyên nhân|is the (?:main )?cause/i);
    expect(result.response).not.toMatch(/đã lưu thay đổi/i);
  });

  it("does not invent timestamps", () => {
    const result = finalizeDanteResponse(baseInput());
    expect(result.audit.routeMetadata.timestamp).toBe(FIXED_TS);
  });
});

describe("Phase 1 — Hard Safety Surface Contract", () => {
  it("preserves STOP/urgency and rejects soft humor", () => {
    const result = applyHardSafetySurfaceContract({
      draft: "Có lẽ hôm nay nên cân nhắc nghỉ một chút 😂 one more set cũng được.",
      language: "vi",
      activityDirective: "STOP",
      evaluationUrgency: "URGENT",
      routeMetadata: { sourceBranch: "HARD_SAFETY", timestamp: FIXED_TS },
      personaContract: defaultPersonaContract("vi"),
    });
    expect(result.audit.hardSafetySurfaceContractApplied).toBe(true);
    expect(result.audit.routeMetadata.hardSafetyBypass).toBe(true);
    expect(result.audit.routeMetadata.finalizerApplied).toBe(false);
    expect(result.audit.surfaceSeverityOk).toBe(true);
    expect(result.response).toMatch(/Dừng set ngay/i);
    expect(result.response).not.toMatch(/😂|one more set|cân nhắc nghỉ một chút/i);
    expect(result.response).not.toMatch(/Context Capsule|EMERGENCY_ACTION/);
  });
});

describe("Phase 1 — authorized bypass matrix", () => {
  it("maps branches to intents without creating parallel coaching taxonomy", () => {
    expect(mapBranchToFinalizerIntent("HARD_SAFETY", null)).toBe("SAFETY_RESPONSE");
    expect(mapBranchToFinalizerIntent("NOF1", null)).toBe("EXPERIMENT_RESPONSE");
    expect(mapBranchToFinalizerIntent("CORRECTION", null)).toBe("CORRECTION_RESPONSE");
    expect(mapBranchToFinalizerIntent("TOOL", null)).toBe("TOOL_ACTION_RESPONSE");
    expect(mapBranchToFinalizerIntent("FALLBACK", null)).toBe("FALLBACK_RESPONSE");
  });
});

describe("Phase 1 — branch coverage checklist (static)", () => {
  const branches = [
    "NORMAL_PROVIDER",
    "HARD_SAFETY",
    "SOCIAL",
    "NOF1",
    "TOOL",
    "CORRECTION",
    "FALLBACK",
    "PROVIDER_FAILURE",
    "CURRENT_STATE",
    "CONFIDENCE",
    "RISK",
    "CASUAL",
  ] as const;

  it("documents required branches", () => {
    expect(branches).toContain("NORMAL_PROVIDER");
    expect(branches).toContain("HARD_SAFETY");
    expect(branches).toContain("PROVIDER_FAILURE");
  });
});
