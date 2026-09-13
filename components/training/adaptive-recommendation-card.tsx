import { ChevronDown } from "lucide-react";

import type { ProgramAdaptation } from "@/lib/dante-core/adaptive-program-engine";
import type { ConfidenceLevel } from "@/lib/dante-core/types";
import type { AdaptationHistoryEntry } from "@/lib/dante-core/load-adaptation-history";
import type { ProgressionInput } from "@/lib/training/progression-engine";
import {
  RECOMMENDATION_STATUS_ACCENT,
  RECOMMENDATION_STATUS_LABEL,
  statusFromProgramAdaptation,
} from "@/lib/dante-core/recommendation-status";
import { WhatIfPreview } from "@/components/training/what-if-preview";
import { cn } from "@/lib/cn";

const HISTORY_ACTION_LABEL: Record<string, string> = {
  INCREASE_LOAD: "Progress",
  HOLD: "Maintain",
  DECREASE_LOAD: "Reduce",
};

function formatHistoryDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The compact "Last session / Next session / status / Why This?" card
 * (mission Part 1/2/7/14). Server-renderable — the "Why This?"
 * disclosure uses a native <details> element, exactly like
 * components/dante/dante-intelligence-panel.tsx, so no client JS is
 * needed just to show it. One card per exercise, never a large
 * explanation panel by default (mission: "keep the UI compact").
 */

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Limited data",
};

function formatLastSets(sets: ProgramAdaptation["lastSessionSets"]): string {
  const completed = sets.filter((set) => set.completed && set.reps !== null);
  if (completed.length === 0) return "—";
  return completed.map((set) => set.reps).join(" / ");
}

function lastSessionWeight(sets: ProgramAdaptation["lastSessionSets"]): number | null {
  const completed = sets.filter((set) => set.completed && set.weightKg !== null);
  if (completed.length === 0) return null;
  // Most recent working weight is what the athlete actually loaded — take the mode/first rather than an average, so "80 kg" isn't silently smoothed across a warm-up-to-working-set ramp.
  return completed[0].weightKg;
}

export function AdaptiveRecommendationCard({
  adaptation,
  confidence,
  reasons,
  recoveryScore,
  recoveryStatusLabel,
  history = [],
  recoveryStatusCode,
  trainingLoadState,
}: {
  adaptation: ProgramAdaptation;
  confidence: ConfidenceLevel;
  reasons: string[];
  recoveryScore: number | null;
  recoveryStatusLabel: string | null;
  /** Real dante_program_adaptations rows only — empty when none exist yet (never fabricated). */
  history?: AdaptationHistoryEntry[];
  recoveryStatusCode: ProgressionInput["recoveryStatus"];
  trainingLoadState: ProgressionInput["trainingLoadState"];
}) {
  const status = statusFromProgramAdaptation(adaptation);
  const accent = RECOMMENDATION_STATUS_ACCENT[status];
  const lastWeight = lastSessionWeight(adaptation.lastSessionSets);
  const lastReps = formatLastSets(adaptation.lastSessionSets);

  const nextTargetLine =
    adaptation.action === "INCREASE_LOAD" && adaptation.suggestedWeightKg !== null
      ? `${adaptation.suggestedWeightKg} kg`
      : lastWeight !== null
        ? `${lastWeight} kg`
        : "—";

  const hasEvidence = reasons.length > 0 || recoveryScore !== null || history.length > 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
      {status === "caution" ? (
        <div className="mb-1">
          <p className={cn("text-xs font-black uppercase tracking-[0.14em]", accent.text)}>Caution</p>
          <p className="mt-1.5 text-sm leading-6 text-zinc-300">Progression paused for this movement.</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">Reason: A recent check-in flagged pain or illness.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Last session</p>
            <p className="mt-1.5 text-lg font-black text-white">{lastWeight !== null ? `${lastWeight} kg` : "—"}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{lastReps}</p>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Next session</p>
            <p className="mt-1.5 text-lg font-black text-white">{nextTargetLine}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {adaptation.targetRepMin}–{adaptation.targetRepMax} reps
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em]",
            accent.text,
            accent.border,
            accent.bg,
          )}
        >
          {RECOMMENDATION_STATUS_LABEL[status]}
        </span>

        {confidence === "low" ? (
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-600">
            {CONFIDENCE_LABEL[confidence]}
          </span>
        ) : null}

        {hasEvidence ? (
          <details className="group ml-auto">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 transition-colors hover:text-zinc-300">
              Why this?
              <ChevronDown className="size-3 transition-transform duration-200 group-open:rotate-180" />
            </summary>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-600">Performance</p>
                <p className="mt-0.5 text-sm font-bold text-white">{lastReps}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {adaptation.action === "INCREASE_LOAD" ? "Top of target range" : `Target ${adaptation.targetRepMin}–${adaptation.targetRepMax}`}
                </p>
              </div>

              {recoveryScore !== null ? (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-600">Recovery</p>
                  <p className="mt-0.5 text-sm font-bold text-white">{recoveryScore}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{recoveryStatusLabel ?? "—"}</p>
                </div>
              ) : null}
            </div>

            {reasons.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {reasons.map((reason, index) => (
                  <li key={index} className="text-xs leading-5 text-zinc-500">
                    • {reason}
                  </li>
                ))}
              </ul>
            ) : null}

            {history.length > 0 ? (
              <div className="mt-3 border-t border-white/[0.06] pt-2.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-600">Recent</p>
                <ul className="mt-1.5 space-y-1">
                  {history.map((entry) => (
                    <li key={entry.id} className="text-xs leading-5 text-zinc-500">
                      {formatHistoryDate(entry.createdAt)} — {HISTORY_ACTION_LABEL[entry.action] ?? entry.action}
                      {entry.suggestedWeightKg !== null ? ` (${entry.suggestedWeightKg} kg)` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </details>
        ) : null}
      </div>

      {status !== "caution" ? (
        <WhatIfPreview
          base={{
            targetRepMin: adaptation.targetRepMin,
            targetRepMax: adaptation.targetRepMax,
            targetRir: null,
            lastSessionSets: adaptation.lastSessionSets,
            recoveryStatus: recoveryStatusCode,
            trainingLoadState,
          }}
        />
      ) : null}
    </div>
  );
}
