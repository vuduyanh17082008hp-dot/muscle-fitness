/**
 * Phase 2A — Memory Foundation (additive over L0–L4).
 *
 * Maps the existing hierarchy into session / short-term / long-term
 * scopes without redesigning Dante:
 *
 *   session     — ephemeral working memory for the current turn
 *   short_term  — L1 observations (immutable episodic evidence)
 *   long_term   — L2/L3 learned patterns (promotable / decayable)
 *
 * Raw episodic evidence (L1) is never rewritten. Promotion, revision,
 * and decay operate on long-term pattern state only. Current athlete
 * state always overrides stale remembered facts when they conflict.
 */

import {
  applyDecay,
  isActionablePolicy,
  recordEvidence,
} from "@/lib/dante-core/memory-hierarchy/consolidate";
import type {
  ContextKey,
  DanteLearnedPattern,
  DanteObservation,
  InterventionType,
  ObservedOutcome,
} from "@/lib/dante-core/memory-hierarchy/types";
import { assertLearningScope } from "@/lib/dante-core/learning-guardrails";

export type MemoryScope = "session" | "short_term" | "long_term";

export type MemoryProvenance = {
  source: string;
  recordedAt: string;
  /** Engine or skill that produced the fact — never "llm" for learnable evidence. */
  producer: string;
};

export type SessionMemoryItem = {
  key: string;
  value: string | number | boolean | null;
  confidence: number;
  provenance: MemoryProvenance;
  /** ISO timestamp — session items expire with the turn unless promoted. */
  expiresAt: string | null;
};

export type ShortTermMemoryItem = {
  scope: "short_term";
  observationId: string;
  userId: string;
  contextKey: ContextKey;
  interventionType: InterventionType;
  outcome: ObservedOutcome;
  confidence: number;
  provenance: MemoryProvenance;
  immutable: true;
  observedAt: string;
};

export type LongTermMemoryItem = {
  scope: "long_term";
  pattern: DanteLearnedPattern;
  confidence: number;
  provenance: MemoryProvenance;
  actionable: boolean;
};

export type WorkingMemory = {
  userId: string;
  sessionId: string;
  items: SessionMemoryItem[];
};

/** Create an empty client-scoped working (session) memory. */
export function createWorkingMemory(userId: string, sessionId: string): WorkingMemory {
  if (!userId.trim()) {
    throw new Error("Working memory requires a client user id.");
  }
  return { userId, sessionId, items: [] };
}

export function putSessionFact(
  memory: WorkingMemory,
  item: Omit<SessionMemoryItem, "confidence"> & { confidence?: number },
): WorkingMemory {
  assertSameClient(memory.userId, memory.userId);
  const confidence = clamp01(item.confidence ?? 0.5);
  const nextItems = memory.items.filter((existing) => existing.key !== item.key);
  nextItems.push({
    key: item.key,
    value: item.value,
    confidence,
    provenance: item.provenance,
    expiresAt: item.expiresAt,
  });
  return { ...memory, items: nextItems };
}

export function observationToShortTerm(observation: DanteObservation): ShortTermMemoryItem {
  return {
    scope: "short_term",
    observationId: observation.id,
    userId: observation.userId,
    contextKey: observation.contextKey,
    interventionType: observation.interventionType,
    outcome: observation.outcome,
    confidence: observation.outcome === "unknown" ? 0 : 1,
    provenance: {
      source: "dante_observations",
      recordedAt: observation.observedAt,
      producer: observation.provenance,
    },
    immutable: true,
    observedAt: observation.observedAt,
  };
}

/**
 * Raw episodic evidence is append-only. Attempts to "revise" an
 * observation produce a NEW short-term item referencing a revision
 * note — the original observation identity is never mutated.
 */
export function reviseEpisodicEvidence(
  original: ShortTermMemoryItem,
  revision: {
    note: string;
    producer: string;
    now?: Date;
  },
): { original: ShortTermMemoryItem; revisionNote: SessionMemoryItem } {
  if (!original.immutable) {
    throw new Error("Only immutable short-term evidence can be revised via note.");
  }

  const now = (revision.now ?? new Date()).toISOString();
  return {
    original,
    revisionNote: {
      key: `revision:${original.observationId}`,
      value: revision.note,
      confidence: 1,
      provenance: {
        source: "episodic_revision_note",
        recordedAt: now,
        producer: revision.producer,
      },
      expiresAt: null,
    },
  };
}

/**
 * Promote a positive short-term observation into long-term pattern
 * evidence. Guardrails still apply — safety/medical provenance cannot
 * enter learnable long-term memory.
 */
export function promoteToLongTerm(
  existing: DanteLearnedPattern | null,
  input: {
    userId: string;
    contextKey: ContextKey;
    interventionType: InterventionType;
    positive: boolean;
    provenance: string;
    now?: Date;
  },
): { allowed: boolean; reason?: string; pattern: Omit<DanteLearnedPattern, "id"> | null } {
  const scope = assertLearningScope({
    userId: input.userId,
    interventionType: input.interventionType,
    provenance: input.provenance,
  });

  if (!scope.allowed) {
    return { allowed: false, reason: scope.reason, pattern: null };
  }

  if (input.contextKey === "insufficient_data") {
    return { allowed: false, reason: "Insufficient context cannot promote to long-term memory.", pattern: null };
  }

  const pattern = recordEvidence(existing, {
    userId: input.userId,
    contextKey: input.contextKey,
    interventionType: input.interventionType,
    positive: input.positive,
    now: input.now,
  });

  return { allowed: true, pattern };
}

export function decayLongTerm(
  pattern: DanteLearnedPattern,
  now: Date = new Date(),
): LongTermMemoryItem {
  const decayed = applyDecay(pattern, now);
  return {
    scope: "long_term",
    pattern: decayed,
    confidence: decayed.confidence,
    provenance: {
      source: "dante_learned_patterns",
      recordedAt: decayed.lastReinforcedAt,
      producer: "consolidate.applyDecay",
    },
    actionable: isActionablePolicy(decayed),
  };
}

/**
 * When live athlete state conflicts with a remembered long-term fact,
 * current state wins. Memory is retained for audit but marked stale
 * for decisioning.
 */
export function resolveCurrentOverStale<T>(input: {
  currentValue: T | null | undefined;
  rememberedValue: T | null | undefined;
  memoryConfidence: number;
  staleAfterDays: number;
  lastReinforcedAt: string;
  now?: Date;
}): {
  value: T | null;
  source: "current" | "memory" | "none";
  memoryStale: boolean;
} {
  const now = input.now ?? new Date();
  const days =
    (now.getTime() - new Date(input.lastReinforcedAt).getTime()) / (1000 * 60 * 60 * 24);
  const memoryStale = days > input.staleAfterDays || input.memoryConfidence < 0.3;

  if (input.currentValue !== null && input.currentValue !== undefined) {
    return { value: input.currentValue, source: "current", memoryStale };
  }

  if (!memoryStale && input.rememberedValue !== null && input.rememberedValue !== undefined) {
    return { value: input.rememberedValue, source: "memory", memoryStale: false };
  }

  return { value: null, source: "none", memoryStale };
}

/** Hard client isolation check — never mix user ids across memory ops. */
export function assertSameClient(ownerUserId: string, subjectUserId: string): void {
  if (!ownerUserId.trim() || ownerUserId !== subjectUserId) {
    throw new Error("Cross-client memory access is forbidden.");
  }
}

export function filterPatternsForClient(
  patterns: DanteLearnedPattern[],
  userId: string,
): DanteLearnedPattern[] {
  return patterns.filter((pattern) => pattern.userId === userId);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
