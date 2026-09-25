import type {
  EvidenceCertainty,
  SemanticProposition,
} from "@/lib/dante-core/adaptive-coach-v2/types";

export type PropositionSource = {
  id: string;
  propositionKey: string;
  value: string;
  recency: "CURRENT" | "RECENT" | "HISTORICAL";
  reliability: "USER_EXPLICIT" | "USER_SUBJECTIVE" | "WEARABLE" | "DATABASE" | "DERIVED" | "ASSISTANT";
  explicitness: "EXPLICIT" | "UNCERTAIN" | "INFERRED";
  certainty: EvidenceCertainty | "LOW" | "MEDIUM" | "HIGH";
  safetyPriority?: "NONE" | "ELEVATED" | "HIGH";
};

export type PropositionConflictResult = {
  sameProposition: boolean;
  conflict: boolean;
  winner?: PropositionSource;
  reason: string;
};

/**
 * Resolve conflicts only when sources refer to the SAME proposition.
 * CERTAINTY != URGENCY — low-certainty chest pain can still be high urgency.
 */
export function resolvePropositionConflict(
  left: PropositionSource,
  right: PropositionSource,
): PropositionConflictResult {
  if (left.propositionKey !== right.propositionKey) {
    return {
      sameProposition: false,
      conflict: false,
      reason: "Unrelated propositions — do not force a global source ladder.",
    };
  }

  const safetyRank = { NONE: 0, ELEVATED: 1, HIGH: 2 } as const;
  const leftSafety = safetyRank[left.safetyPriority ?? "NONE"];
  const rightSafety = safetyRank[right.safetyPriority ?? "NONE"];
  if (leftSafety !== rightSafety) {
    const winner = leftSafety > rightSafety ? left : right;
    return {
      sameProposition: true,
      conflict: left.value !== right.value,
      winner,
      reason: "Safety priority outranks certainty for the same proposition.",
    };
  }

  const recencyRank = { CURRENT: 3, RECENT: 2, HISTORICAL: 1 } as const;
  if (recencyRank[left.recency] !== recencyRank[right.recency]) {
    const winner = recencyRank[left.recency] > recencyRank[right.recency] ? left : right;
    return {
      sameProposition: true,
      conflict: left.value !== right.value,
      winner,
      reason: "Same proposition — more recent explicit report wins; history retained separately.",
    };
  }

  const reliabilityRank: Record<PropositionSource["reliability"], number> = {
    WEARABLE: 4,
    DATABASE: 4,
    USER_EXPLICIT: 3,
    USER_SUBJECTIVE: 2,
    DERIVED: 1,
    ASSISTANT: 0,
  };
  // Subjective recovery vs wearable sleep are different keys — if same key, prefer explicit user for feelings.
  if (left.propositionKey.includes("subjective") || right.propositionKey.includes("subjective")) {
    const userSide = left.reliability === "USER_SUBJECTIVE" || left.reliability === "USER_EXPLICIT" ? left : right;
    return {
      sameProposition: true,
      conflict: false,
      winner: userSide,
      reason: "Subjective recovery is not overwritten by unrelated wearable metrics.",
    };
  }

  if (reliabilityRank[left.reliability] !== reliabilityRank[right.reliability]) {
    const winner = reliabilityRank[left.reliability] > reliabilityRank[right.reliability] ? left : right;
    return {
      sameProposition: true,
      conflict: left.value !== right.value,
      winner,
      reason: "Same proposition — higher source reliability wins when recency ties.",
    };
  }

  return {
    sameProposition: true,
    conflict: left.value !== right.value,
    winner: left.explicitness === "EXPLICIT" ? left : right,
    reason: left.value === right.value ? "Aligned sources." : "Ambiguous same-proposition conflict.",
  };
}

export function areUnrelatedPropositions(leftKey: string, rightKey: string): boolean {
  return leftKey !== rightKey;
}

/** Map semantic propositions into proposition keys for conflict checks. */
export function propositionKeyFor(item: SemanticProposition): string {
  const temporal = item.temporalAnchor ?? item.temporal;
  return `${item.concept}:${temporal}:${item.laterality ?? "UNSPECIFIED"}`;
}
