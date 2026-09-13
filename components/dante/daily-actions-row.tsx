"use client";

import { useState } from "react";

import type { DanteProposedAction } from "@/lib/dante-core/actions/types";
import type { ConfidenceLevel } from "@/lib/dante-core/types";
import { ActionPreview } from "@/components/dante/action-preview";

/** Honest bucket midpoints for the three deterministic confidence levels — never a fabricated precise number. */
const CONFIDENCE_LEVEL_FRACTION: Record<ConfidenceLevel, number> = {
  low: 0.3,
  moderate: 0.6,
  high: 0.85,
};

export function DailyActionsRow({
  proposedActions,
  decisionConfidenceLevel,
}: {
  proposedActions: DanteProposedAction[];
  decisionConfidenceLevel: ConfidenceLevel;
}) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const confidenceFraction = CONFIDENCE_LEVEL_FRACTION[decisionConfidenceLevel];

  const pending = proposedActions.filter((action) => !resolvedIds.has(action.id));

  if (pending.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-3">
      {pending.map((action) => (
        <ActionPreview
          key={action.id}
          action={action}
          confidenceFraction={confidenceFraction}
          onResolved={(id) => setResolvedIds((prev) => new Set(prev).add(id))}
        />
      ))}
    </div>
  );
}
