import type {
  ContextTier,
  DanteContextCapsule,
  DanteTaskId,
} from "@/lib/dante-core/adaptive-coach-v2/types";

export type ContextTelemetry = {
  contextSource: string[];
  capsulesRetrieved: string[];
  usage: Record<ContextTier, number>;
};

export type ScheduleContextInput = {
  task: DanteTaskId;
  l1: DanteContextCapsule[];
  l2Candidates?: DanteContextCapsule[];
  l3Candidates?: DanteContextCapsule[];
  maxCapsules?: number;
};

export function scheduleContext(input: ScheduleContextInput): {
  tier: ContextTier;
  capsules: DanteContextCapsule[];
  telemetry: ContextTelemetry;
} {
  const maxCapsules = Math.max(1, input.maxCapsules ?? 8);
  const selected = input.l1.slice(0, maxCapsules);
  const simpleFollowUp = input.task === "REALIZE_RESPONSE" || input.task === "INTERPRET_CURRENT_STATE";
  const l1Enough = selected.length > 0 && selected.some((item) =>
    item.safetyRelevance?.length || item.facts?.length || item.summary || item.structured);

  if (selected.length < maxCapsules && (!simpleFollowUp || !l1Enough)) {
    selected.push(...(input.l2Candidates ?? []).slice(0, maxCapsules - selected.length));
  }
  if (selected.length < maxCapsules && !l1Enough) {
    selected.push(...(input.l3Candidates ?? []).slice(0, maxCapsules - selected.length));
  }

  const l1Ids = new Set(input.l1.map((item) => item.id));
  const l2Ids = new Set((input.l2Candidates ?? []).map((item) => item.id));
  const usage = selected.reduce<Record<ContextTier, number>>((counts, item) => {
    const tier: ContextTier = l1Ids.has(item.id) ? "L1" : l2Ids.has(item.id) ? "L2" : "L3";
    counts[tier] += 1;
    return counts;
  }, { L1: 0, L2: 0, L3: 0 });
  const tier: ContextTier = usage.L3 > 0 ? "L3" : usage.L2 > 0 ? "L2" : "L1";

  return {
    tier,
    capsules: selected,
    telemetry: {
      contextSource: selected.map((item) => item.sourceType),
      capsulesRetrieved: selected.map((item) => item.id),
      usage,
    },
  };
}
