import { interpretUserTurn } from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";
import { normalizeSafetyText } from "@/lib/dante-core/safety-layer";
import type {
  ProvenanceKind,
  SemanticInterpretation,
  SemanticProposition,
} from "@/lib/dante-core/adaptive-coach-v2/types";

export type ProposedClaim = {
  claim: string;
  concept?: string;
  requiredState?: SemanticProposition["state"];
  provenance?: ProvenanceKind | string;
};

export type GatedClaims = {
  supported: Array<{ claim: string; provenance: string }>;
  conditional: Array<{ claim: string; provenance: string }>;
  unknown: Array<{ claim: string; provenance: string }>;
  prohibitedAttributions: Array<{ claim: string; reason: string }>;
};

export function isAssistantGeneratedEvidenceAllowed(): false {
  return false;
}

export function classifyMemorySource(kind: ProvenanceKind | string): {
  evidenceAllowed: boolean;
  authority: "TRUTH" | "STYLE_CONTEXT_ONLY" | "NONE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
} {
  if (kind === "VERIFIED_TOOL_DATA") return { evidenceAllowed: true, authority: "TRUTH", confidence: "HIGH" };
  if (kind === "EXPLICIT_CURRENT_REPORT" || kind === "EXPLICIT_HISTORICAL_REPORT") {
    return { evidenceAllowed: true, authority: "TRUTH", confidence: "MEDIUM" };
  }
  if (kind === "USER_RECALL_UNCERTAIN" || kind === "DERIVED") {
    return { evidenceAllowed: true, authority: "TRUTH", confidence: "LOW" };
  }
  if (kind === "ASSISTANT_GENERATED") return { evidenceAllowed: false, authority: "NONE", confidence: "LOW" };
  return { evidenceAllowed: false, authority: "STYLE_CONTEXT_ONLY", confidence: "LOW" };
}

export function gateUserSpecificClaims(
  interpretation: SemanticInterpretation,
  proposedClaims: ProposedClaim[],
): GatedClaims {
  const result: GatedClaims = { supported: [], conditional: [], unknown: [], prohibitedAttributions: [] };

  for (const proposed of proposedClaims) {
    if (proposed.provenance === "ASSISTANT_GENERATED") {
      result.prohibitedAttributions.push({ claim: proposed.claim, reason: "Assistant text is not user evidence." });
      continue;
    }
    const proposition = proposed.concept
      ? interpretation.propositions.find((item) =>
        item.concept === proposed.concept && (!proposed.requiredState || item.state === proposed.requiredState))
      : undefined;
    if (!proposition) {
      result.unknown.push({ claim: proposed.claim, provenance: proposed.provenance ?? "UNKNOWN" });
      continue;
    }
    const item = { claim: proposed.claim, provenance: proposition.provenance };
    if (proposition.provenance === "USER_RECALL_UNCERTAIN" || proposition.state === "HISTORICAL") {
      result.conditional.push(item);
    } else {
      result.supported.push(item);
    }
  }

  return result;
}

export function interpretAmbiguousHistory(text: string): SemanticInterpretation {
  const interpretation = interpretUserTurn(text);
  const normalized = normalizeSafetyText(text);
  const uncertain = /(?:hinh nhu|chac la|khong co log|maybe|i think|not sure|probably)/i.test(normalized);
  const propositions = interpretation.propositions.length > 0
    ? interpretation.propositions
    : uncertain && /\b(?:vai|shoulder)\b/i.test(normalized)
      ? [{
          concept: "SHOULDER_IRRITATION",
          state: "HISTORICAL" as const,
          temporal: "HISTORICAL" as const,
          provenance: "USER_RECALL_UNCERTAIN" as const,
          laterality: "UNCERTAIN" as const,
          count: "UNKNOWN" as const,
        }]
      : [];

  return {
    ...interpretation,
    propositions: propositions.map((item) => ({
      ...item,
      provenance: "USER_RECALL_UNCERTAIN",
      count: /(?:khong co log|no log|not logged)/i.test(normalized) ? "UNVERIFIED" : "UNKNOWN",
      laterality: /\b(?:right|left|phai|trai|chac)\b/i.test(normalized) ? "UNCERTAIN" : item.laterality,
    })),
  };
}
