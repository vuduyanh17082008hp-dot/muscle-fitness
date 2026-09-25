/**
 * Phase 2 → Phase 1 bridge: durable, user-stated facts that the Phase 1 finalizer must be able to see.
 *
 * Phase 1 builds its authoritative state from the CURRENT message only, so a correction the user made in an
 * earlier request ("yesterday was the LEFT shoulder") would look unsupported to the finalizer and be scrubbed to
 * "shoulder (side uncertain)" — the accepted correction would not survive the last stage before the client.
 * The persisted correction is the user's own explicit report, so it is admitted under the same provenance class
 * Phase 1 already trusts for an in-turn statement (EXPLICIT_HISTORICAL_REPORT). Nothing is invented: only
 * active, reducer-owned correction slots are projected, and only fixed past facts (never current state, which
 * could be stale by the time a later request loads it).
 */

import type { CanonicalClaim } from "@/lib/dante-core/runtime-convergence/authoritative-state";
import { activeCorrections } from "@/lib/dante-core/coherence/reducer";
import type { VersionedState } from "@/lib/dante-core/coherence/types";

const LATERALITY_TOPIC = "yesterday_shoulder_laterality";

export function persistedClaimsFromState(state: VersionedState): CanonicalClaim[] {
  const claims: CanonicalClaim[] = [];
  for (const correction of activeCorrections(state)) {
    if (correction.value.topic !== LATERALITY_TOPIC) continue;
    const side = correction.value.statement;
    if (side !== "LEFT" && side !== "RIGHT") continue;
    claims.push({
      concept: "SHOULDER_IRRITATION",
      polarity: "PRESENT",
      temporal: "HISTORICAL",
      provenance: "EXPLICIT_HISTORICAL_REPORT",
      laterality: side,
      count: null,
      countVerified: false,
      source: "PERSISTED_CORRECTION",
    });
  }
  return claims;
}
