import { createSingleShotChatStream } from "@/lib/dante-core/chat-stream-protocol";
import type { ChatStreamDoneEvent } from "@/lib/dante-core/chat-stream-protocol";
import { applyPersonalPt } from "@/lib/dante-core/coherence/personal-pt";
import { enforceFinalSurface, finishCoherenceDraft, type PreparedCoherence } from "@/lib/dante-core/coherence/pipeline";
import { persistedClaimsFromState } from "@/lib/dante-core/coherence/authoritative-claims";
import type { CoherenceTurnResult, VerificationStatus } from "@/lib/dante-core/coherence/types";
import type { HandledObligation } from "@/lib/dante-core/runtime-convergence/multi-intent";
import {
  buildAuthoritativeResponseState,
  type AuthoritativeResponseState,
} from "@/lib/dante-core/runtime-convergence/authoritative-state";
import { finalizeDanteResponse } from "@/lib/dante-core/runtime-convergence/finalize";
import { applyHardSafetySurfaceContract } from "@/lib/dante-core/runtime-convergence/hard-safety-surface";
import type {
  DanteResponseBranch,
  FinalizeDanteResponseInput,
  HardSafetySurfaceInput,
  PersonaContract,
} from "@/lib/dante-core/runtime-convergence/types";

export function defaultPersonaContract(language: "en" | "vi"): PersonaContract {
  return {
    status: "DEFAULT",
    language,
    register: "neutral",
    addressForm: "unresolved",
  };
}

export type CoherenceOverlayOptions = {
  prepared: PreparedCoherence;
  message: string;
  /** The obligation dispositions behind `draft` (multi-intent turns), so the gates check detected == disposed. */
  handledObligations?: HandledObligation[];
  /** Receives the finished Phase 2 turn (incl. post-turn state) so the caller can persist it. */
  onFinished?: (finished: CoherenceTurnResult) => void;
  /**
   * Result of an existing verification path (the route's provider verifier) for provider prose in this reply. Omitted =
   * UNAVAILABLE: unverified provider prose that states no governed claim is then degraded, never trusted (P-10).
   */
  providerVerification?: VerificationStatus;
  /** Who wrote `draft` when no handled obligation carries it. finalizeProviderReply defaults to PROVIDER_OUTPUT. */
  draftSource?: "DETERMINISTIC_DECISION" | "PROVIDER_OUTPUT";
};

/**
 * Phase 2 overlay, shared by every non-HARD_SAFETY reply — deterministic single-shot AND provider text — so
 * there is one pipeline, not a second one for the provider. Runs before the Phase 1 finalizer.
 */
function applyCoherenceOverlay(
  coherence: CoherenceOverlayOptions,
  draft: string,
  authoritative: AuthoritativeResponseState,
  draftSource: "DETERMINISTIC_DECISION" | "PROVIDER_OUTPUT",
): { draft: string; finished: CoherenceTurnResult; trace: string } {
  const finished = finishCoherenceDraft({
    prepared: coherence.prepared,
    message: coherence.message,
    phase1Draft: draft,
    handledObligations: coherence.handledObligations,
    draftSource: coherence.draftSource ?? draftSource,
    authoritative,
    providerVerification: coherence.providerVerification,
  });
  coherence.onFinished?.(finished);
  const persona = finished.persona;
  const degradedBlocks = finished.responseBlocks.filter((b) => b.renderStatus === "DEGRADED").length;
  return {
    draft: finished.response,
    finished,
    trace: `phase2:entry=${finished.entryClass};life=${finished.lifecycle};safe=${finished.audit.safetyPhase};repair=${finished.repairAttempts};deg=${finished.degraded ? 1 : 0};post=${finished.postTurnFailed ? "fail" : "ok"};persona=${persona.repairAttempts}${persona.fallback ? ":neutral" : ""};ctx=${finished.expressionPlan.contextMode};authdeg=${degradedBlocks}`,
  };
}

/** Gate C + Final Coherence Gate on the finalized text (the bytes the client receives). */
function enforceCoherenceOnFinalText(
  coherence: CoherenceOverlayOptions,
  finished: CoherenceTurnResult,
  text: string,
  truthPass: (text: string) => string,
): { text: string; trace: string } {
  const enforced = enforceFinalSurface({ prepared: coherence.prepared, finished, text, truthPass });
  return {
    text: enforced.text,
    trace: `phase2:final=${enforced.degraded ? "degraded" : enforced.repairAttempts > 0 ? `repaired:${enforced.repairAttempts}` : "ok"}`,
  };
}

/**
 * Emit a user-visible single-shot reply through the Phase 1 boundary.
 * HARD_SAFETY uses Hard Safety Surface Contract (authorized bypass of ordinary finalizer).
 */
export function emitConvergedSingleShot(input: {
  draft: string;
  branch: DanteResponseBranch;
  requestTimestamp: string;
  language: "en" | "vi";
  done: Omit<ChatStreamDoneEvent, "type">;
  decisionObject?: FinalizeDanteResponseInput["decisionObject"];
  semanticState?: FinalizeDanteResponseInput["semanticState"];
  contextCapsule?: FinalizeDanteResponseInput["contextCapsule"];
  discourseState?: FinalizeDanteResponseInput["discourseState"];
  toolState?: FinalizeDanteResponseInput["toolState"];
  responseIntent?: FinalizeDanteResponseInput["responseIntent"];
  recommendationCode?: string | null;
  causalTarget?: string | null;
  hardSafety?: {
    activityDirective: HardSafetySurfaceInput["activityDirective"];
    evaluationUrgency: HardSafetySurfaceInput["evaluationUrgency"];
  };
  /**
   * Attach compact Phase-1 audit on done.toolTraceSummary (never user text).
   * Defaults true so every converged emit carries required route metadata.
   */
  attachAuditTrace?: boolean;
  /** Phase 2 surface overlay. Does not replace Phase 1 finalizer truth. */
  coherence?: CoherenceOverlayOptions;
}): Response {
  let draft = input.draft;
  const extraTrace: string[] = [];
  let overlayFinished: CoherenceTurnResult | null = null;
  const overlayEligible = Boolean(input.coherence) && input.branch !== "HARD_SAFETY";
  // Authority is built BEFORE the overlay: the same state that truth-finalizes the reply decides which provider claims
  // may reach the surface at all (P-10).
  const authoritativeState = buildAuthoritativeResponseState({
    interpretation: input.semanticState ?? null,
    decision: input.decisionObject ?? null,
    toolState: input.toolState
      ? {
          permission: input.toolState.permission ?? "READ",
          persisted: input.toolState.persisted ?? false,
        }
      : null,
    causalTarget: input.causalTarget ?? null,
    persistedClaims: overlayEligible && input.coherence
      ? persistedClaimsFromState(input.coherence.prepared.state)
      : undefined,
  });
  if (input.coherence && input.branch !== "HARD_SAFETY") {
    const overlay = applyCoherenceOverlay(input.coherence, input.draft, authoritativeState, "DETERMINISTIC_DECISION");
    draft = overlay.draft;
    overlayFinished = overlay.finished;
    extraTrace.push(overlay.trace);
  } else if (input.coherence) {
    extraTrace.push(`phase2:entry=${input.coherence.prepared.entryClass};life=${input.coherence.prepared.snapshot.lifecycle};safe=${input.coherence.prepared.safetyPhase};bypass=hard_safety`);
  }

  const personaContract = defaultPersonaContract(input.language);
  const attachAudit = input.attachAuditTrace !== false;

  if (input.branch === "HARD_SAFETY") {
    const safetyDraft = input.hardSafety?.activityDirective === "MODIFY"
      ? applyPersonalPt({
        draft: input.draft,
        message: input.coherence?.message,
        language: input.language,
        safetyCategory: input.done.safetyCategory ?? null,
      })
      : input.draft;
    const surface = applyHardSafetySurfaceContract({
      draft: safetyDraft,
      language: input.language,
      activityDirective: input.hardSafety?.activityDirective ?? "STOP",
      evaluationUrgency: input.hardSafety?.evaluationUrgency ?? "URGENT",
      routeMetadata: {
        sourceBranch: "HARD_SAFETY",
        timestamp: input.requestTimestamp,
      },
      personaContract,
    });
    const meta = surface.audit.routeMetadata;
    const toolTraceSummary = attachAudit
      ? [
          ...input.done.toolTraceSummary,
          ...extraTrace,
          `phase1:branch=HARD_SAFETY;ts=${meta.timestamp};fp=${meta.responseFingerprint};finalizer=0;bypass=1`,
        ]
      : [...input.done.toolTraceSummary, ...extraTrace];
    return createSingleShotChatStream(surface.response, {
      ...input.done,
      toolTraceSummary,
      safetyTriggered: true,
    });
  }

  const finalizeDraft = (text: string) => finalizeDanteResponse({
    draft: text,
    decisionObject: input.decisionObject ?? null,
    semanticState: input.semanticState ?? null,
    contextCapsule: input.contextCapsule ?? null,
    personaContract,
    routeMetadata: {
      sourceBranch: input.branch,
      timestamp: input.requestTimestamp,
    },
    discourseState: input.discourseState ?? null,
    toolState: input.toolState ?? null,
    responseIntent: input.responseIntent,
    recommendationCode: input.recommendationCode ?? null,
    causalTarget: input.causalTarget ?? authoritativeState.causalClaims[0]?.target ?? null,
    authoritativeState,
  });
  const finalized = finalizeDraft(draft);

  let finalText = finalized.response;
  if (input.coherence && overlayFinished) {
    const enforced = enforceCoherenceOnFinalText(input.coherence, overlayFinished, finalText, (text) => finalizeDraft(text).response);
    finalText = enforced.text;
    extraTrace.push(enforced.trace);
  }

  const meta = finalized.audit.routeMetadata;
  const toolTraceSummary = attachAudit
    ? [
        ...input.done.toolTraceSummary,
        ...extraTrace,
        `phase1:branch=${meta.sourceBranch};ts=${meta.timestamp};fp=${meta.responseFingerprint};finalizer=1;bypass=0`,
      ]
    : [...input.done.toolTraceSummary, ...extraTrace];

  return createSingleShotChatStream(finalText, {
    ...input.done,
    toolTraceSummary,
  });
}

export function finalizeProviderReply(input: {
  draft: string;
  requestTimestamp: string;
  language: "en" | "vi";
  branch?: DanteResponseBranch;
  decisionObject?: FinalizeDanteResponseInput["decisionObject"];
  semanticState?: FinalizeDanteResponseInput["semanticState"];
  toolState?: FinalizeDanteResponseInput["toolState"];
  causalTarget?: string | null;
  /** Same Phase 2 overlay the single-shot path uses. Omitted only by callers with no coherence session. */
  coherence?: CoherenceOverlayOptions;
}): { text: string; fingerprint: string; finalizerApplied: true; phase2Trace: string[] } {
  const phase2Trace: string[] = [];
  let draft = input.draft;
  let overlayFinished: CoherenceTurnResult | null = null;
  const authoritativeState = buildAuthoritativeResponseState({
    interpretation: input.semanticState ?? null,
    decision: input.decisionObject ?? null,
    toolState: input.toolState
      ? {
          permission: input.toolState.permission ?? "READ",
          persisted: input.toolState.persisted ?? false,
        }
      : null,
    causalTarget: input.causalTarget ?? null,
    persistedClaims: input.coherence
      ? persistedClaimsFromState(input.coherence.prepared.state)
      : undefined,
  });
  if (input.coherence) {
    // A provider reply is provider prose by construction: its blocks are born UNVERIFIED (P-10).
    const overlay = applyCoherenceOverlay(input.coherence, input.draft, authoritativeState, "PROVIDER_OUTPUT");
    draft = overlay.draft;
    overlayFinished = overlay.finished;
    phase2Trace.push(overlay.trace);
  }
  const finalizeDraft = (text: string) => finalizeDanteResponse({
    draft: text,
    decisionObject: input.decisionObject ?? null,
    semanticState: input.semanticState ?? null,
    contextCapsule: null,
    personaContract: defaultPersonaContract(input.language),
    routeMetadata: {
      sourceBranch: input.branch ?? "NORMAL_PROVIDER",
      timestamp: input.requestTimestamp,
    },
    toolState: input.toolState ?? null,
    causalTarget: input.causalTarget ?? authoritativeState.causalClaims[0]?.target ?? null,
    authoritativeState,
  });
  const result = finalizeDraft(draft);
  let text = result.response;
  if (input.coherence && overlayFinished) {
    const enforced = enforceCoherenceOnFinalText(input.coherence, overlayFinished, text, (fallbackText) => finalizeDraft(fallbackText).response);
    text = enforced.text;
    phase2Trace.push(enforced.trace);
  }
  return {
    text,
    fingerprint: result.audit.routeMetadata.responseFingerprint,
    finalizerApplied: true,
    phase2Trace,
  };
}
