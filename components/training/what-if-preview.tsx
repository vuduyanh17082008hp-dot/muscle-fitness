"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";

import {
  computeExerciseProgression,
  type LoggedSetForProgression,
  type ProgressionInput,
  type ProgressionResult,
} from "@/lib/training/progression-engine";
import {
  RECOMMENDATION_STATUS_ACCENT,
  RECOMMENDATION_STATUS_LABEL,
  statusFromProgramAdaptation,
} from "@/lib/dante-core/recommendation-status";
import { cn } from "@/lib/cn";

/**
 * Lightweight "What if?" preview (mission Part 10). Runs the SAME
 * deterministic lib/training/progression-engine.ts function that
 * already produced the real recommendation above, with one input
 * temporarily overridden — entirely in the browser, no network call,
 * nothing persisted. Only scenarios the engine can genuinely evaluate
 * from its own real inputs are offered (recovery/training-load/pain
 * conditions) — there is no fabricated "what if I lifted 85kg"
 * scenario, since that would require inventing a hypothetical
 * session that never happened.
 */

export type WhatIfBaseInput = {
  targetRepMin: number;
  targetRepMax: number;
  targetRir: number | null;
  lastSessionSets: LoggedSetForProgression[];
  recoveryStatus: ProgressionInput["recoveryStatus"];
  trainingLoadState: ProgressionInput["trainingLoadState"];
};

type Scenario = {
  id: string;
  label: string;
  override: Partial<ProgressionInput>;
};

const SCENARIOS: Scenario[] = [
  { id: "priority-recovery", label: "Recovery were in the priority range?", override: { recoveryStatus: "priority" } },
  { id: "elevated-load", label: "Training load were elevated?", override: { trainingLoadState: "red" } },
  { id: "pain-flag", label: "A pain flag were reported?", override: { recentPainFlag: true } },
];

function toResultBadge(result: ProgressionResult) {
  const status = statusFromProgramAdaptation({
    exerciseId: "",
    exerciseName: "",
    action: result.action,
    suggestedWeightKg: result.suggestedWeightKg,
    gated: result.gated,
    gateReason: result.gateReason,
    subAction: result.subAction,
    evidenceSampleSize: 0,
    lastSessionSets: [],
    targetRepMin: 0,
    targetRepMax: 0,
  });

  return { status, accent: RECOMMENDATION_STATUS_ACCENT[status], label: RECOMMENDATION_STATUS_LABEL[status] };
}

export function WhatIfPreview({ base }: { base: WhatIfBaseInput }) {
  const [open, setOpen] = useState(false);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [result, setResult] = useState<ProgressionResult | null>(null);

  function runScenario(scenario: Scenario) {
    const preview = computeExerciseProgression({
      targetRepMin: base.targetRepMin,
      targetRepMax: base.targetRepMax,
      targetRir: base.targetRir,
      lastSessionSets: base.lastSessionSets,
      recentPainFlag: false,
      recoveryStatus: base.recoveryStatus,
      trainingLoadState: base.trainingLoadState,
      ...scenario.override,
    });

    setActiveScenario(scenario.id);
    setResult(preview);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-600 transition-colors hover:text-zinc-400"
      >
        <FlaskConical className="size-3" aria-hidden="true" />
        What if?
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">What if?</p>

      <div className="mt-2 flex flex-wrap gap-2">
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            onClick={() => runScenario(scenario)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
              activeScenario === scenario.id
                ? "border-white/20 bg-white/[0.08] text-white"
                : "border-white/10 text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300",
            )}
          >
            {scenario.label}
          </button>
        ))}
      </div>

      {result ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/[0.07] bg-black/20 p-2.5">
          {(() => {
            const { accent, label } = toResultBadge(result);
            return (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em]",
                  accent.text,
                  accent.border,
                  accent.bg,
                )}
              >
                {label}
              </span>
            );
          })()}
          <p className="text-xs leading-5 text-zinc-500">{result.reason}</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-600">Preview only — nothing is saved unless you log a real session.</p>
      )}
    </div>
  );
}
