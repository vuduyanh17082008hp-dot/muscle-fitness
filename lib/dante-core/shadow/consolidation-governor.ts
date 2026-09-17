import { assertRawEvidenceImmutable } from "@/lib/dante-core/epistemic-integrity";
import { assertSameClient } from "@/lib/dante-core/memory-hierarchy/memory-foundation";
import type {
  ConsolidationCandidate,
  ConsolidationDecision,
} from "@/lib/dante-core/shadow/types";

export function governConsolidation(candidate: ConsolidationCandidate): ConsolidationDecision {
  const base = {
    userId: candidate.userId,
    candidateId: candidate.candidateId,
    preservedEpisodeIds: [...candidate.provenanceEpisodeIds],
  };

  if (!candidate.supported || candidate.provenanceEpisodeIds.length === 0 || candidate.evidenceCount === 0) {
    return { ...base, action: "REJECT", reasonCodes: ["UNSUPPORTED_CANDIDATE"] };
  }
  if (candidate.anomalousOutcomeCount === 1 && candidate.cleanContradictionCount < 2) {
    return { ...base, action: "QUARANTINE", reasonCodes: ["SINGLE_ANOMALOUS_OUTCOME_REVIEW"] };
  }
  if (candidate.cleanContradictionCount >= 2 && candidate.contradictionCount >= 2) {
    return { ...base, action: "REVISE", reasonCodes: ["REPEATED_CLEAN_CONTRADICTION"] };
  }
  if (candidate.stale || candidate.confidence < 0.4) {
    return { ...base, action: "RETAIN", reasonCodes: [candidate.stale ? "STALE_BUT_PROVENANCE_RETAINED" : "LOW_CONFIDENCE_RETAIN"] };
  }
  if (candidate.evidenceCount >= 3 && candidate.confidence >= 0.65) {
    return { ...base, action: "MERGE", reasonCodes: ["REPEATED_SUPPORTED_EVIDENCE"] };
  }
  return { ...base, action: "RETAIN", reasonCodes: ["MORE_EVIDENCE_REQUIRED"] };
}

/**
 * Re-evaluates a belief from copies of the original episodes. The
 * originals are checked after evaluation so consolidation can never
 * silently rewrite provenance-bearing raw evidence.
 */
export function reevaluateFromRawEpisodes<T extends Record<string, unknown>>(input: {
  userId: string;
  episodes: Array<T & { userId: string }>;
  evaluate: (episodes: T[]) => ConsolidationCandidate;
}): { decision: ConsolidationDecision; episodesIntact: boolean } {
  input.episodes.forEach((episode) => assertSameClient(input.userId, episode.userId));
  const originals = input.episodes.map((episode) => structuredClone(episode));
  const workingCopies = input.episodes.map((episode) => structuredClone(episode));
  const candidate = input.evaluate(workingCopies);
  assertSameClient(input.userId, candidate.userId);

  const episodesIntact = originals.every((original, index) =>
    assertRawEvidenceImmutable(original, input.episodes[index]!).intact,
  );

  return { decision: governConsolidation(candidate), episodesIntact };
}
