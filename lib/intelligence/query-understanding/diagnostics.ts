import type { RetrievalDecision, UserQueryFrame } from "./types";

/**
 * Privacy-safe diagnostics: enums, counts and booleans only. Never raw text, Athlete State, secrets or reasoning.
 * Event names follow the spec (QUERY_FRAME_BUILT, DOMAIN_CLASSIFIED, ENTITY_RESOLVED, REFERENCE_RESOLVED,
 * RETRIEVAL_ROUTE_SELECTED, AMBIGUITY_DETECTED, CROSS_DOMAIN_RELEVANCE); USDA_LOOKUP / LOCAL_LOOKUP live in food-resolution.
 */
export interface QueryDiagnostics {
  QUERY_FRAME_BUILT: { language: string; intent: string; informationNeed: string; confidenceClass: string; entityCount: number };
  DOMAIN_CLASSIFIED: { primary: string; secondaryCount: number; owner: string };
  ENTITY_RESOLVED: { kinds: Record<string, number> };
  REFERENCE_RESOLVED: { fromHistory: boolean; resolvedCount: number; unresolvedCount: number };
  RETRIEVAL_ROUTE_SELECTED: { route: string; thinking: string; sourceCount: number };
  AMBIGUITY_DETECTED: { present: boolean; fieldCount: number };
  CROSS_DOMAIN_RELEVANCE: { relevance: string; deferToGemma: boolean };
}

export function buildQueryDiagnostics(frame: UserQueryFrame, retrieval: RetrievalDecision): QueryDiagnostics {
  const kinds: Record<string, number> = {};
  for (const entity of frame.entities) kinds[entity.kind] = (kinds[entity.kind] ?? 0) + 1;
  return {
    QUERY_FRAME_BUILT: { language: frame.language, intent: frame.intent, informationNeed: frame.informationNeed, confidenceClass: frame.confidenceClass, entityCount: frame.entities.length },
    DOMAIN_CLASSIFIED: { primary: frame.primaryDomain, secondaryCount: frame.secondaryDomains.length, owner: frame.owner },
    ENTITY_RESOLVED: { kinds },
    REFERENCE_RESOLVED: { fromHistory: frame.references.resolvedFromHistory, resolvedCount: frame.references.previousEntityRefs.length, unresolvedCount: frame.references.unresolvedReferences.length },
    RETRIEVAL_ROUTE_SELECTED: { route: retrieval.route, thinking: retrieval.thinking, sourceCount: retrieval.sources.length },
    AMBIGUITY_DETECTED: { present: frame.ambiguity.present, fieldCount: frame.ambiguity.fields.length },
    CROSS_DOMAIN_RELEVANCE: { relevance: frame.crossCoachRelevance, deferToGemma: frame.deferToGemma },
  };
}
