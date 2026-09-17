import { describe, expect, it } from "vitest";

import {
  assertSameClient,
  createWorkingMemory,
  decayLongTerm,
  filterPatternsForClient,
  observationToShortTerm,
  promoteToLongTerm,
  putSessionFact,
  resolveCurrentOverStale,
  reviseEpisodicEvidence,
} from "@/lib/dante-core/memory-hierarchy/memory-foundation";
import type { DanteLearnedPattern, DanteObservation } from "@/lib/dante-core/memory-hierarchy/types";

function sampleObservation(overrides: Partial<DanteObservation> = {}): DanteObservation {
  return {
    id: "obs-1",
    userId: "user-a",
    contextKey: "poor_sleep",
    interventionType: "reduce_volume",
    beforeState: { recoveryScore: 50 },
    afterState: { recoveryScore: 62 },
    outcome: "improved",
    goalAligned: true,
    provenance: "dante_action_log",
    observedAt: "2026-09-16T10:00:00.000Z",
    ...overrides,
  };
}

describe("Phase 2A memory foundation", () => {
  it("keeps session memory client-scoped and overwritable by key", () => {
    let memory = createWorkingMemory("user-a", "session-1");
    memory = putSessionFact(memory, {
      key: "focus_muscle",
      value: "chest",
      provenance: {
        source: "current_turn",
        recordedAt: "2026-09-16T10:00:00.000Z",
        producer: "chat",
      },
      expiresAt: null,
    });
    memory = putSessionFact(memory, {
      key: "focus_muscle",
      value: "back",
      confidence: 0.9,
      provenance: {
        source: "current_turn",
        recordedAt: "2026-09-16T10:01:00.000Z",
        producer: "chat",
      },
      expiresAt: null,
    });

    expect(memory.userId).toBe("user-a");
    expect(memory.items).toHaveLength(1);
    expect(memory.items[0]?.value).toBe("back");
    expect(memory.items[0]?.confidence).toBe(0.9);
  });

  it("marks short-term observations as immutable episodic evidence", () => {
    const shortTerm = observationToShortTerm(sampleObservation());
    expect(shortTerm.immutable).toBe(true);
    expect(shortTerm.scope).toBe("short_term");
    expect(shortTerm.confidence).toBe(1);

    const revised = reviseEpisodicEvidence(shortTerm, {
      note: "Later check-in clarified soreness was DOMS, not injury.",
      producer: "athlete_correction",
    });

    expect(revised.original.observationId).toBe("obs-1");
    expect(revised.revisionNote.key).toBe("revision:obs-1");
  });

  it("blocks promotion from safety provenance into long-term memory", () => {
    const result = promoteToLongTerm(null, {
      userId: "user-a",
      contextKey: "poor_sleep",
      interventionType: "reduce_volume",
      positive: true,
      provenance: "safety-layer/chest_pain",
    });

    expect(result.allowed).toBe(false);
    expect(result.pattern).toBeNull();
  });

  it("promotes eligible evidence and refuses one-shot policy certainty", () => {
    const first = promoteToLongTerm(null, {
      userId: "user-a",
      contextKey: "poor_sleep",
      interventionType: "reduce_volume",
      positive: true,
      provenance: "dante_action_log",
    });

    expect(first.allowed).toBe(true);
    expect(first.pattern?.tier).toBe("pattern");
    expect(first.pattern?.confidence ?? 1).toBeLessThan(0.7);
  });

  it("decays long-term confidence for unreinformed patterns", () => {
    const pattern: DanteLearnedPattern = {
      id: "pat-1",
      userId: "user-a",
      contextKey: "poor_sleep",
      interventionType: "reduce_volume",
      tier: "policy",
      status: "active",
      sampleCount: 8,
      positiveCount: 7,
      confidence: 0.875,
      summary: "test",
      firstObservedAt: "2026-01-01T00:00:00.000Z",
      lastReinforcedAt: "2026-01-01T00:00:00.000Z",
      requiresConfirmation: false,
    };

    const decayed = decayLongTerm(pattern, new Date("2026-09-16T00:00:00.000Z"));
    expect(decayed.confidence).toBeLessThan(pattern.confidence);
    expect(decayed.scope).toBe("long_term");
  });

  it("lets current athlete state override stale memory", () => {
    const result = resolveCurrentOverStale({
      currentValue: 72,
      rememberedValue: 55,
      memoryConfidence: 0.8,
      staleAfterDays: 14,
      lastReinforcedAt: "2026-01-01T00:00:00.000Z",
      now: new Date("2026-09-16T00:00:00.000Z"),
    });

    expect(result.source).toBe("current");
    expect(result.value).toBe(72);
    expect(result.memoryStale).toBe(true);
  });

  it("enforces client isolation", () => {
    expect(() => assertSameClient("user-a", "user-b")).toThrow(/Cross-client/);
    expect(
      filterPatternsForClient(
        [
          { ...samplePattern("user-a"), id: "1" },
          { ...samplePattern("user-b"), id: "2" },
        ],
        "user-a",
      ),
    ).toHaveLength(1);
  });
});

function samplePattern(userId: string): DanteLearnedPattern {
  return {
    id: "x",
    userId,
    contextKey: "poor_sleep",
    interventionType: "reduce_volume",
    tier: "pattern",
    status: "active",
    sampleCount: 3,
    positiveCount: 2,
    confidence: 0.25,
    summary: "test",
    firstObservedAt: "2026-09-01T00:00:00.000Z",
    lastReinforcedAt: "2026-09-10T00:00:00.000Z",
    requiresConfirmation: false,
  };
}
