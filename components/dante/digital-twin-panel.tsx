import { ChevronDown } from "lucide-react";

import type { AthleteState } from "@/lib/athlete-state/types";
import type { DataFreshnessSignal } from "@/lib/athlete-state/data-freshness";
import type { BaselineDeviation } from "@/lib/dante-core/personal-baseline";
import { DanteMemoryEditor } from "@/components/dante/dante-memory-editor";
import type { DanteMemory } from "@/lib/dante-core/memory";

/**
 * Athlete Digital Twin — concise surfaces (spec "8. UI": "Do NOT add
 * a giant new dashboard... Use progressive disclosure"). One panel,
 * four collapsible sections, added to the existing Training
 * Intelligence page rather than a new route. Every number here is
 * read straight from AthleteState — this component computes nothing.
 */

function FreshnessBadge({ label, signal }: { label: string; signal: DataFreshnessSignal }) {
  const tone =
    signal.status === "current"
      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
      : signal.status === "stale"
        ? "border-amber-400/25 bg-amber-400/10 text-amber-300"
        : "border-white/10 bg-white/[0.04] text-zinc-500";

  return (
    <div className={`rounded-xl border px-3 py-2 ${tone}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.14em]">{label}</p>
      <p className="mt-0.5 text-xs font-semibold">{signal.humanReadable}</p>
    </div>
  );
}

function DeviationRow({ label, deviation, unit }: { label: string; deviation: BaselineDeviation; unit: string }) {
  if (deviation.baseline === null) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-white/5 py-3 last:border-b-0">
        <span className="text-sm text-zinc-400">{label}</span>
        <span className="text-xs text-zinc-600">
          Not enough history yet ({deviation.sampleCount} sample{deviation.sampleCount === 1 ? "" : "s"})
        </span>
      </div>
    );
  }

  const delta = deviation.delta ?? 0;
  const trendColor = delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-zinc-400";
  const sign = delta > 0 ? "+" : "";

  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-3 last:border-b-0">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="text-right text-sm">
        <span className="font-bold text-white">
          {deviation.current ?? "—"}
          {unit}
        </span>
        <span className="mx-1.5 text-zinc-600">vs your usual</span>
        <span className="font-bold text-zinc-300">
          {deviation.baseline}
          {unit}
        </span>
        {deviation.delta !== null ? (
          <span className={`ml-1.5 font-bold ${trendColor}`}>
            ({sign}
            {deviation.delta}
            {unit})
          </span>
        ) : null}
      </span>
    </div>
  );
}

const RECOVERY_STATE_LABEL: Record<string, string> = {
  well_recovered: "Well recovered",
  recovering: "Recovering",
  needs_recovery: "Needs recovery",
  insufficient_data: "Not enough data",
};

const RECOVERY_STATE_TONE: Record<string, string> = {
  well_recovered: "text-emerald-400",
  recovering: "text-amber-400",
  needs_recovery: "text-rose-400",
  insufficient_data: "text-zinc-500",
};

export function DigitalTwinPanel({
  athleteState,
  memory,
}: {
  athleteState: AthleteState;
  memory: DanteMemory;
}) {
  const { derived, dataFreshness } = athleteState;

  return (
    <section className="rounded-[20px] border border-white/10 bg-mf-surface p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-400">
            Athlete Digital Twin
          </p>
          <h2 className="mt-1 text-xl font-bold text-white">Your current state, explained</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold text-zinc-400">
          {Math.round(derived.overallConfidence * 100)}% confidence
        </span>
      </div>

      {derived.missingData.length > 0 ? (
        <p className="mt-3 text-xs text-zinc-500">
          Still building a full picture — no data yet for: {derived.missingData.join(", ")}.
        </p>
      ) : null}

      {/* CURRENT STATE + FRESHNESS */}
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <FreshnessBadge label="Recovery" signal={dataFreshness.recovery} />
        <FreshnessBadge label="Nutrition" signal={dataFreshness.nutrition} />
        <FreshnessBadge label="Training" signal={dataFreshness.training} />
        <FreshnessBadge label="SetVision" signal={dataFreshness.setVision} />
        <FreshnessBadge label="Bodyweight" signal={dataFreshness.bodyweight} />
      </div>

      {/* BASELINE CHANGES */}
      <details className="group mt-6 rounded-2xl border border-white/10 bg-black/20 px-4">
        <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-bold text-white">
          Baseline changes — you vs. your own normal
          <ChevronDown className="size-4 text-zinc-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="pb-4">
          <DeviationRow label="Sleep" deviation={derived.baselineDeviations.sleep} unit="h" />
          <DeviationRow label="Recovery score" deviation={derived.baselineDeviations.recoveryScore} unit="" />
          <DeviationRow
            label="Weekly training volume"
            deviation={derived.baselineDeviations.trainingLoad}
            unit=" sets"
          />
        </div>
      </details>

      {/* MUSCLE RECOVERY MAP */}
      <details className="group mt-3 rounded-2xl border border-white/10 bg-black/20 px-4">
        <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-bold text-white">
          Muscle Recovery Map — estimated training readiness
          <ChevronDown className="size-4 text-zinc-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 pb-4">
          {derived.muscleRecoveryMap.length === 0 ? (
            <p className="text-sm text-zinc-500">No logged training yet to estimate muscle recovery from.</p>
          ) : (
            derived.muscleRecoveryMap.map((entry) => (
              <div key={entry.muscle} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{entry.muscleLabel}</span>
                  <span className={`text-xs font-bold ${RECOVERY_STATE_TONE[entry.recoveryState]}`}>
                    {RECOVERY_STATE_LABEL[entry.recoveryState]}
                    {entry.score !== null ? ` · ${entry.score}%` : ""}
                  </span>
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {entry.drivers.map((driver) => (
                    <li key={driver} className="text-xs text-zinc-500">
                      {driver}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </details>

      {/* DANTE MEMORY */}
      <details className="group mt-3 rounded-2xl border border-white/10 bg-black/20 px-4">
        <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-bold text-white">
          What Dante remembers about you
          <ChevronDown className="size-4 text-zinc-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="pb-5">
          <DanteMemoryEditor initialMemory={memory} />
        </div>
      </details>
    </section>
  );
}
