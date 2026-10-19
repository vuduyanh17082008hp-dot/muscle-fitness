import { guardMutationClaims } from "@/lib/dante-core/tools/action-response-guard";
import { mapSentencesKeepingLists } from "@/lib/intelligence/performance-core/claim-revision";
import { validateOutputClaims } from "@/lib/dante-core/adaptive-coach-v2/output-claim-validator";
import { scrubInternalJargon } from "@/lib/dante-core/adaptive-coach-v2/natural-response/jargon-policy";
import { buildDanteDecision } from "@/lib/dante-core/adaptive-coach-v2/decision-object";
import { interpretUserTurn } from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";
import type { OutputClaimConstraints } from "@/lib/dante-core/adaptive-coach-v2/types";
import {
  buildAuthoritativeResponseState,
  isSidedStatement,
  type AuthoritativeResponseState,
} from "@/lib/dante-core/runtime-convergence/authoritative-state";
import { projectClaims, scrubRawContextLeaks } from "@/lib/dante-core/runtime-convergence/claim-projection";
import {
  canonicalizeCausalTarget,
  canonicalizeRecommendationCode,
  computeResponseFingerprint,
  deriveSafetySurfaceClass,
  mapBranchToFinalizerIntent,
  normalizeForFingerprint,
} from "@/lib/dante-core/runtime-convergence/fingerprint";
import { assertNoMetadataLeak } from "@/lib/dante-core/runtime-convergence/hard-safety-surface";
import type {
  FinalizeDanteResponseInput,
  FinalizeDanteResponseResult,
  FinalizerResponseIntent,
  SafetySurfaceClass,
} from "@/lib/dante-core/runtime-convergence/types";

const RAW_CONTEXT_LEAK =
  /(?:context capsule|decision object|tool authority|risk accumulator|provenance gate|working memory dump|\[SYSTEM\]|system prompt)/i;

/**
 * Semantics-preserving surface naturalization ONLY.
 * Changes wording, never proposition.
 */
function applySemanticsPreservingSurfaceTransform(text: string, language: "en" | "vi"): string {
  let out = scrubInternalJargon(text, language);
  out = out
    .replace(/\bcausal attribution not established\b/gi, language === "vi"
      ? "Chưa đủ dữ liệu để nói sleep là nguyên nhân."
      : "There is not enough data to say sleep is the cause.")
    .replace(/\bnot established as the cause\b/gi, language === "vi"
      ? "chưa đủ để kết luận là nguyên nhân"
      : "is not established as the cause");
  // Spaces only: `\s{2,}` also turned paragraph breaks into spaces, merging lists and caveats into one line.
  out = out.replace(RAW_CONTEXT_LEAK, "").replace(/[ \t]{2,}/g, " ").trim();
  return out;
}

function enforceContextPrivacy(text: string): string {
  return scrubRawContextLeaks(
    text
      .replace(/```[\s\S]*?```/g, "")
      .replace(RAW_CONTEXT_LEAK, "")
      .replace(/\buser_id\s*[:=]\s*\S+/gi, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

/**
 * H0 cluster C: MODEL TEXT cannot establish mutation success. Only a backend receipt (`toolState.persisted === true`)
 * may leave a "logged / saved / recorded / confirmed" claim; no toolState at all means no receipt.
 */
function enforceActionTruth(text: string, toolState: FinalizeDanteResponseInput["toolState"], language: "en" | "vi"): string {
  return guardMutationClaims(text, {
    receipt: toolState?.persisted === true,
    pending: toolState?.permission === "CONFIRMATION_REQUIRED",
    language,
  });
}

/**
 * H0 cluster G: internal prompt text never reaches the user. A sentence carrying a prompt-section marker or a
 * model-directed instruction is removed whole; every other sentence (the user's content) is left exactly as written.
 */
const INSTRUCTION_LEAK = /\b(?:PERFORMANCE INTELLIGENCE BRIEF|SAFETY POSTURE|CONVERSATION CONTEXT —|KNOWLEDGE_STATE|CANONICAL KNOWLEDGE —|REASONING RULES|OPEN REQUEST UNDER A SAFETY BOUNDARY|SYSTEM-COMPUTED CAVEATS|FINAL INSTRUCTION|CLIENT QUESTION|obligationId|OBLIGATION_ENVELOPES)\b|never quote or mention this block|do not quote this block|\bDo not dump\b/;

export function scrubInstructionLeak(text: string): string {
  if (!INSTRUCTION_LEAK.test(text)) return text;
  return mapSentencesKeepingLists(text, (sentence) => (INSTRUCTION_LEAK.test(sentence) ? null : sentence));
}

function resolveAuthoritativeState(input: FinalizeDanteResponseInput): AuthoritativeResponseState {
  if (input.authoritativeState) return input.authoritativeState;
  return buildAuthoritativeResponseState({
    interpretation: input.semanticState,
    decision: input.decisionObject,
    toolState: input.toolState
      ? {
          permission: input.toolState.permission ?? "READ",
          persisted: input.toolState.persisted ?? false,
        }
      : null,
    causalTarget: input.causalTarget ?? null,
  });
}

/**
 * Canonical final response boundary.
 * Constrained transformer — NOT a second reasoning engine.
 * NEVER generates timestamps. NEVER mutates Control Plane. NEVER calls tools/DB/LLM.
 */
export function finalizeDanteResponse(input: FinalizeDanteResponseInput): FinalizeDanteResponseResult {
  const language = input.personaContract.language;
  const decision = input.decisionObject;
  const authoritative = resolveAuthoritativeState(input);
  const responseIntent: FinalizerResponseIntent =
    input.responseIntent ?? mapBranchToFinalizerIntent(input.routeMetadata.sourceBranch, decision);
  const safetySurfaceClass: SafetySurfaceClass =
    input.safetySurfaceClass
    ?? deriveSafetySurfaceClass({ decision, hardSafety: false });
  const recommendationCode = canonicalizeRecommendationCode(input.recommendationCode ?? null);
  const causalTarget = canonicalizeCausalTarget(
    input.causalTarget ?? authoritative.causalClaims[0]?.target ?? null,
  );
  const rationaleCodes = [...(input.discourseState?.rationaleCodes ?? decision?.discourse.rationaleCodes ?? [])];

  // Prefer authoritative constraints over invented defaults when synthesizing DO.
  const uncertainCount = authoritative.provenanceConstraints.some((c) => !c.mayAssertExactCount);
  const hasVerifiedLaterality = [...authoritative.historicalClaims, ...authoritative.currentStateClaims].some(
    (c) =>
      (c.laterality === "LEFT" || c.laterality === "RIGHT")
      && (c.provenance === "VERIFIED_TOOL_DATA" || c.provenance === "EXPLICIT_HISTORICAL_REPORT" || c.provenance === "EXPLICIT_CURRENT_REPORT"),
  );
  const verifiedSide = [...authoritative.historicalClaims, ...authoritative.currentStateClaims].find(
    (c) =>
      (c.laterality === "LEFT" || c.laterality === "RIGHT")
      && c.provenance === "VERIFIED_TOOL_DATA",
  );
  // The user's own latest accepted correction from an earlier request (Phase 2 durable state). It ranks below
  // tool-verified data and only decides which side may be *kept*; it never widens what counts as verified.
  const persistedSide = authoritative.historicalClaims.find(
    (c) => c.source === "PERSISTED_CORRECTION" && (c.laterality === "LEFT" || c.laterality === "RIGHT"),
  );
  // The user named BOTH sides with their own state this turn ("left hurts, right doesn't"). Neither is unauthorized.
  const statedSides = new Set(
    [...authoritative.historicalClaims, ...authoritative.currentStateClaims]
      .filter((c) => isSidedStatement(c) && (c.laterality === "LEFT" || c.laterality === "RIGHT"))
      .map((c) => c.laterality),
  );
  const bothSidesStated = statedSides.has("LEFT") && statedSides.has("RIGHT");
  const assertedSide = verifiedSide ?? (bothSidesStated ? undefined : persistedSide);
  const uncertainLaterality = !hasVerifiedLaterality && (
    authoritative.provenanceConstraints.some((c) => !c.mayAssertLaterality)
    || authoritative.historicalClaims.some((c) => c.laterality === "UNCERTAIN" || c.laterality === "UNKNOWN")
  );
  const lateralityConstraint: NonNullable<OutputClaimConstraints["laterality"]> | undefined =
    assertedSide?.laterality === "LEFT" || assertedSide?.laterality === "RIGHT"
      ? assertedSide.laterality
      : bothSidesStated
        ? "BOTH"
        : uncertainLaterality
          ? "UNCERTAIN"
          : undefined;
  const shoulderClaims = authoritative.currentStateClaims.filter((c) => c.concept === "SHOULDER_IRRITATION");
  // With a side contrast the shoulder IS irritated now (one side hurts); the negative sibling must not flip it to ABSENT.
  const currentShoulder = shoulderClaims.find((c) => isSidedStatement(c) && c.polarity === "PRESENT") ?? shoulderClaims[0];
  const currentChest = authoritative.currentStateClaims.find((c) => c.concept === "CHEST_PAIN");

  const decisionForValidation = decision ?? buildDanteDecision({
    interpretation: input.semanticState ?? interpretUserTurn(""),
    tool: input.toolState
      ? {
          permission: input.toolState.permission ?? "READ",
          persisted: input.toolState.persisted ?? false,
        }
      : undefined,
    claimConstraints: {
      persisted: input.toolState?.persisted ?? false,
      sleepCausality: authoritative.causalClaims[0]?.conclusion === "ESTABLISHED"
        ? "ESTABLISHED"
        : authoritative.causalClaims[0]?.conclusion === "CONDITIONAL"
          ? "CONDITIONAL"
          : "NOT_ESTABLISHED",
      episodeCount: uncertainCount ? "UNVERIFIED" : "UNKNOWN",
      laterality: lateralityConstraint ?? "UNSPECIFIED",
      currentShoulder: currentShoulder?.polarity === "PRESENT" || currentShoulder?.polarity === "ABSENT"
        ? currentShoulder.polarity
        : undefined,
      currentChestPain: currentChest?.polarity === "PRESENT" || currentChest?.polarity === "ABSENT"
        ? currentChest.polarity
        : undefined,
      experimentConclusion: authoritative.experimentState?.conclusion === "UNKNOWN"
        ? "NONE"
        : authoritative.experimentState?.conclusion ?? "NONE",
    },
  });

  const claimResult = validateOutputClaims({
    draft: input.draft,
    decision: {
      ...decisionForValidation,
      tool: {
        permission: input.toolState?.permission ?? decisionForValidation.tool?.permission ?? "READ",
        persisted: input.toolState?.persisted ?? decisionForValidation.tool?.persisted ?? false,
      },
      userLanguage: language,
      claimConstraints: {
        ...decisionForValidation.claimConstraints,
        currentShoulder: currentShoulder?.polarity === "PRESENT" || currentShoulder?.polarity === "ABSENT"
          ? currentShoulder.polarity
          : decisionForValidation.claimConstraints?.currentShoulder,
        episodeCount: uncertainCount ? "UNVERIFIED" : decisionForValidation.claimConstraints?.episodeCount,
        laterality: lateralityConstraint ?? decisionForValidation.claimConstraints?.laterality,
        sleepCausality: causalTarget === "SLEEP" ? "NOT_ESTABLISHED" : decisionForValidation.claimConstraints?.sleepCausality,
      },
    },
  });

  let response = claimResult.repairedText;

  // Claim projection — 7 high-risk families from authoritative state (no new facts).
  const projected = projectClaims({
    draft: response,
    authoritative: {
      ...authoritative,
      causalClaims: causalTarget
        ? [{
            target: causalTarget,
            observedOutcome: authoritative.causalClaims[0]?.observedOutcome ?? null,
            conclusion: authoritative.causalClaims[0]?.conclusion ?? "NOT_ESTABLISHED",
          }]
        : authoritative.causalClaims,
      actionState: input.toolState
        ? {
            permission: input.toolState.permission ?? "READ",
            persisted: input.toolState.persisted ?? false,
          }
        : authoritative.actionState,
    },
    language,
  });
  response = projected.text;

  response = enforceActionTruth(response, input.toolState ?? decision?.tool ?? null, language);
  response = scrubInstructionLeak(response);
  response = enforceContextPrivacy(response);
  response = applySemanticsPreservingSurfaceTransform(response, language);

  if (!assertNoMetadataLeak(response)) {
    response = response.replace(/(?:responseFingerprint|finalizerApplied|hardSafetyBypass|sourceBranch)\s*[:=]\s*\S+/gi, "").trim();
  }

  if (process.env.DANTE_RUNTIME_AUDIT === "true") {
    console.info("[DANTE_FINALIZATION_AUDIT]", {
      sourceBranch: input.routeMetadata.sourceBranch,
      finalizerApplied: true,
      claimProjectionApplied: true,
      provenanceProjectionApplied: Boolean(projected.provenance),
      provenanceMonotonicityPassed: projected.provenance?.monotonicityPassed ?? null,
      provenanceRepairApplied: projected.provenance?.repairApplied ?? false,
      finalVisibleRepairApplied: projected.repaired || claimResult.usedDeterministicRepair,
      canaryDetectedInOutput: /DANTE_PRIVATE_CONTEXT_CANARY_[A-Z0-9]+/.test(response),
      downstreamOverwriteFound: false,
    });
  }

  const fingerprint = computeResponseFingerprint({
    sourceBranch: input.routeMetadata.sourceBranch,
    responseIntent,
    rationaleCodes,
    recommendationCode,
    causalTarget,
    safetySurfaceClass,
    normalizedText: normalizeForFingerprint(response),
  });

  return {
    response,
    audit: {
      routeMetadata: {
        sourceBranch: input.routeMetadata.sourceBranch,
        timestamp: input.routeMetadata.timestamp,
        responseFingerprint: fingerprint,
        finalizerApplied: true,
        hardSafetyBypass: false,
      },
      responseIntent,
      recommendationCode,
      causalTarget,
      safetySurfaceClass,
      violations: [
        ...claimResult.violations.map((item) => item.code),
        ...projected.violations.map((item) => item.code),
      ],
      personaContractReceived: true,
      claimValidatorApplied: true,
      controlPlaneMutated: false,
      externalSideEffects: false,
    },
  };
}
