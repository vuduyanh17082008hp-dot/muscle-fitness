/**
 * Phase 1 Final Closure — TRACE SWEEP ONLY (no behavior assertions beyond logging).
 * Run: npx vitest run lib/dante-core/__tests__/_phase1-trace-sweep.test.ts
 */
import { describe, it } from "vitest";
import { interpretUserTurn } from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";
import { buildAuthoritativeResponseState, extractCausalTargetFromText } from "@/lib/dante-core/runtime-convergence";
import { extractCurrentTurnState } from "@/lib/dante-core/current-turn-state";
import { evaluateSocialBoundary, buildSocialBoundaryResponse, createSocialRouterSession } from "@/lib/dante-core/social-boundary-router";
import { assessTurnConfidence } from "@/lib/dante-core/confidence-engine/assess";
import { buildConfidenceDeterministicReply } from "@/lib/dante-core/confidence-engine/deterministic-reply";
import { checkSafety } from "@/lib/dante-core/safety-layer";
import { evaluateContrastiveSafety, semanticSafetySignals } from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";

const MIXED = `tao nhớ chắc tháng 6 vai trái đau 1 lần vì có ghi log.
còn tháng trước thì hình như đau thêm 3-4 lần gì đó,
không ghi nên không chắc.
tổng cộng coi như 5 lần confirmed nhé`;

const CAUSAL = `2 tuần nay tao ngủ thêm 1 tiếng và cũng giảm volume.
bench RPE giảm từ 9 xuống 7.
vậy sleep chắc là nguyên nhân chính đúng không?`;

const TEMPORAL_SAFETY = `lúc nãy tao nói tê tay nhưng tao nói nhầm,
đó là tuần trước.
hiện tại không tê, không chóng mặt, không đau ngực.
tao chỉ hơi mệt vì ngủ ít thôi.
giờ có đang ở tình trạng cấp cứu không?`;

function meta(label: string, value: unknown) {
  // Metadata-only audit for TRACE SWEEP.
  console.info(`[TRACE_SWEEP ${label}]`, JSON.stringify(value));
}

describe("PHASE 1 TRACE SWEEP (no patches)", () => {
  it("A — mixed claims", () => {
    const interp = interpretUserTurn(MIXED);
    meta("A.semantic.propositions", interp.propositions.map((p, i) => ({
      i,
      concept: p.concept,
      polarity: p.polarity,
      temporal: p.temporalAnchor ?? p.temporal,
      provenance: p.provenance,
      laterality: p.laterality,
      count: p.count,
      certainty: p.certainty,
      rawSpan: p.rawSpan,
    })));
    const auth = buildAuthoritativeResponseState({ interpretation: interp });
    meta("A.authoritative", {
      current: auth.currentStateClaims,
      historical: auth.historicalClaims,
      provenance: auth.provenanceConstraints,
    });
    const cts = extractCurrentTurnState(MIXED);
    meta("A.currentTurn", {
      shoulderIrritated: cts.shoulderIrritated,
      resolved: cts.shoulderIrritationResolved,
    });
  });

  it("B — causal route vs social", () => {
    const social = evaluateSocialBoundary(CAUSAL, { session: createSocialRouterSession() });
    meta("B.social", {
      mode: social.mode,
      target: social.target,
      derailmentStreak: social.derailmentStreak,
      replyPreviewFamily: buildSocialBoundaryResponse(social, "vi").slice(0, 80),
    });
    const interp = interpretUserTurn(CAUSAL);
    meta("B.semantic", {
      propositions: interp.propositions.map((p) => ({
        concept: p.concept,
        temporal: p.temporalAnchor ?? p.temporal,
        provenance: p.provenance,
      })),
      causalTarget: extractCausalTargetFromText(CAUSAL),
    });
    const cts = extractCurrentTurnState(CAUSAL);
    const conf = assessTurnConfidence({ message: CAUSAL, currentState: cts });
    meta("B.confidence", {
      claims: conf.claims.map((c) => `${c.claimId}:${c.level}`),
      keepMostlyInvisible: conf.keepMostlyInvisible,
      reply: buildConfidenceDeterministicReply(conf, "vi", { message: CAUSAL })?.slice(0, 120) ?? null,
    });
  });

  it("C — temporal safety", () => {
    const interp = interpretUserTurn(TEMPORAL_SAFETY);
    meta("C.semantic", interp.propositions.map((p) => ({
      concept: p.concept,
      polarity: p.polarity,
      temporal: p.temporalAnchor ?? p.temporal,
      resolution: p.resolution,
      provenance: p.provenance,
      certainty: p.certainty,
      rawSpan: p.rawSpan,
    })));
    meta("C.contrastiveSafety", evaluateContrastiveSafety(TEMPORAL_SAFETY));
    meta("C.semanticSafetySignals", semanticSafetySignals(interp));
    const safety = checkSafety(TEMPORAL_SAFETY);
    meta("C.checkSafety", {
      triggered: safety.triggered,
      category: safety.category,
      responseOverridePreview: safety.responseOverride?.slice(0, 100) ?? null,
    });
    const cts = extractCurrentTurnState(TEMPORAL_SAFETY);
    meta("C.currentTurn", {
      numbnessPresent: cts.numbnessPresent,
      weaknessPresent: cts.weaknessPresent,
      swellingPresent: cts.swellingPresent,
    });
  });
});
