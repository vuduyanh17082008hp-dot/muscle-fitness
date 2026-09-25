import type {
  ConversationCommitments,
  DanteContextCapsule,
  DanteDecision,
} from "@/lib/dante-core/adaptive-coach-v2/types";
import { createCapsule } from "@/lib/dante-core/adaptive-coach-v2/context/capsule";
import { extractRationaleCodes } from "@/lib/dante-core/adaptive-coach-v2/natural-response/repetition-detector";

export const EMPTY_COMMITMENTS: ConversationCommitments = {
  activeConclusions: [],
  rejectedClaims: [],
  pendingActions: [],
  pendingQuestions: [],
  alreadyExplainedRationales: [],
  rationaleCodes: [],
  recentCorrections: [],
};

export function updateConversationCommitments(
  previous: ConversationCommitments,
  update: {
    decision: DanteDecision;
    reply?: string;
    correctionSummary?: string;
    rejectedClaim?: string;
    pendingAction?: string;
  },
): ConversationCommitments {
  const rationaleCodes = [
    ...previous.rationaleCodes,
    ...(update.decision.discourse.rationaleCodes ?? []),
    ...(update.reply ? extractRationaleCodes(update.reply) : []),
  ];
  const activeConclusions = [...previous.activeConclusions];
  if (update.decision.experiment?.internalStatus === "CONFOUNDED") {
    activeConclusions.push("sleep_causality=NOT_ESTABLISHED");
  }
  if (update.decision.claimConstraints?.sleepCausality === "NOT_ESTABLISHED") {
    activeConclusions.push("sleep_causality=NOT_ESTABLISHED");
  }

  const rejectedClaims = [...previous.rejectedClaims];
  if (update.rejectedClaim) rejectedClaims.push(update.rejectedClaim);
  if (update.decision.claimConstraints?.rejectedClaims) {
    rejectedClaims.push(...update.decision.claimConstraints.rejectedClaims);
  }

  const pendingActions = [...previous.pendingActions];
  if (update.pendingAction) pendingActions.push(update.pendingAction);
  if (update.decision.tool?.permission === "CONFIRMATION_REQUIRED" && !update.decision.tool.persisted) {
    pendingActions.push("workout_change_waiting_for_confirmation");
  }

  return {
    activeConclusions: [...new Set(activeConclusions)].slice(-12),
    rejectedClaims: [...new Set(rejectedClaims)].slice(-12),
    pendingActions: [...new Set(pendingActions)].slice(-8),
    pendingQuestions: previous.pendingQuestions.slice(-8),
    alreadyExplainedRationales: [...new Set([
      ...previous.alreadyExplainedRationales,
      ...update.decision.discourse.alreadyExplained,
    ])].slice(-12),
    rationaleCodes: [...new Set(rationaleCodes)].slice(-16),
    recentCorrections: update.correctionSummary
      ? [...previous.recentCorrections, update.correctionSummary].slice(-8)
      : previous.recentCorrections,
  };
}

export function createCommitmentCapsule(
  commitments: ConversationCommitments,
  createdAt = new Date().toISOString(),
): DanteContextCapsule {
  return createCapsule({
    sourceType: "conversation_commitments",
    provenance: "DERIVED",
    trustLevel: "MEDIUM",
    temporalScope: "CURRENT",
    authority: "TRUTH",
    summary: [
      commitments.activeConclusions.length ? `conclusions:${commitments.activeConclusions.join(",")}` : null,
      commitments.rejectedClaims.length ? `rejected:${commitments.rejectedClaims.join(",")}` : null,
      commitments.pendingActions.length ? `pending:${commitments.pendingActions.join(",")}` : null,
    ].filter(Boolean).join(" | ") || "session commitments",
    structured: commitments,
    commitments,
    createdAt,
  });
}

/** If user re-asserts a rejected claim without new evidence, stay consistent. */
export function detectRejectedClaimReassertion(
  message: string,
  commitments: ConversationCommitments,
): string | null {
  const text = message.toLowerCase();
  const wantsSleepCause = /(?:coi|mark|treat|consider).{0,40}sleep.{0,40}(?:nguyen nhan|cause|nguyên nhân)|sleep.{0,30}(?:la nguyen nhan|là nguyên nhân|is the cause)|cu coi sleep/i.test(text);
  const sleepAlreadyRejected =
    commitments.rejectedClaims.some((item) => /sleep/i.test(item))
    || commitments.activeConclusions.includes("sleep_causality=NOT_ESTABLISHED");
  if (wantsSleepCause && sleepAlreadyRejected) {
    return "sleep_is_confirmed_cause";
  }
  return null;
}

export function rejectedClaimContinuityReply(language: "en" | "vi"): string {
  return language === "vi"
    ? "Chưa được. Kết luận đó đã bị bác vì chưa có bằng chứng mới — sleep vẫn chưa nhận hết công."
    : "Not yet. That conclusion already stays rejected without new evidence — sleep still does not get full credit.";
}
