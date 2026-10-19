import { getSource } from "../sources";
import type { ClaimLens, ClaimStance, EvidenceStrength, KnowledgeClaim, KnowledgeClaimType } from "../types";

type ClaimInput = {
  type: KnowledgeClaimType;
  strength: EvidenceStrength;
  stance?: ClaimStance;
  outcome: string;
  population: string;
  context: string;
  claim: string;
  sources: string[];
  conditions?: string[];
  limitations?: string[];
  uncertainty?: string;
  lens?: ClaimLens;
};

/** Builds one claim. The source class is read from the registry, never typed by hand, so it cannot drift from the source. */
export function claim(input: ClaimInput): KnowledgeClaim {
  const first = input.sources[0] ? getSource(input.sources[0]) : null;
  if (input.sources.length > 0 && !first) throw new Error(`Unknown knowledge source: ${input.sources[0]}`);
  return {
    claim: input.claim,
    claimType: input.type,
    evidenceStrength: input.strength,
    stance: input.stance ?? "SUPPORTS",
    outcome: input.outcome,
    population: input.population,
    context: input.context,
    conditions: input.conditions ?? [],
    limitations: input.limitations ?? [],
    uncertainty: input.uncertainty ?? "",
    // An UNKNOWN claim records an absence in this registry and so cites nothing.
    sourceClass: first?.sourceClass ?? "NARRATIVE_REVIEW",
    sourceIds: input.sources,
    ...(input.lens ? { lens: input.lens } : {}),
  };
}
