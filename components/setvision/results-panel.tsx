import { Activity, Gauge, Timer, TrendingDown, Waves } from "lucide-react";

import type { SetVisionAnalysis } from "@/lib/setvision/types";
import { cn } from "@/lib/utils";

/**
 * SetVision results UI (spec Part B §22): Reps / ROM / Tempo /
 * Velocity / Velocity Loss / Consistency. Deliberately plain —
 * numbers and their honest caveats, no flashy overlays that would
 * hide what was actually measured.
 */

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p> : null}
    </div>
  );
}

function ConsistencyBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-zinc-400">{label}</span>
        <span className="font-bold text-white">
          {value === null ? "—" : `${Math.round(value * 100)}%`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn(
            "h-full rounded-full",
            value === null
              ? "bg-white/10"
              : value >= 0.75
                ? "bg-emerald-400"
                : value >= 0.5
                  ? "bg-amber-400"
                  : "bg-rose-400",
          )}
          style={{ width: `${value === null ? 0 : Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function SetVisionResultsPanel({ analysis }: { analysis: SetVisionAnalysis }) {
  const { velocity, technique } = analysis;

  return (
    <article className="rounded-3xl border border-white/10 bg-[#0d0f12] p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-amber-400" aria-hidden="true" />
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
            SetVision analysis
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">
          {Math.round(analysis.confidence * 100)}% confidence
        </span>
      </div>

      <h3 className="mt-3 text-lg font-black text-white">
        {analysis.exercise.replace("_", " ")} — {analysis.reps} rep{analysis.reps === 1 ? "" : "s"}
      </h3>

      <p className="mt-1 text-xs text-zinc-500">
        Classified as {analysis.exerciseClassification.exercise ?? "unknown"} (
        {Math.round(analysis.exerciseClassification.confidence * 100)}% confidence)
        {analysis.exerciseClassification.signals[0]
          ? ` — ${analysis.exerciseClassification.signals[0]}`
          : ""}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Reps" value={String(analysis.reps)} />
        <StatTile
          label="Avg eccentric"
          value={analysis.averageEccentricTime !== null ? `${analysis.averageEccentricTime}s` : "—"}
        />
        <StatTile
          label="Avg concentric"
          value={analysis.averageConcentricTime !== null ? `${analysis.averageConcentricTime}s` : "—"}
        />
        <StatTile
          label={velocity.calibrated ? "Mean velocity" : "Mean speed (normalized)"}
          value={velocity.mean !== null ? `${velocity.mean} ${velocity.unit}` : "—"}
          sub={velocity.calibrated ? undefined : "Not calibrated — not m/s"}
        />
      </div>

      {velocity.velocityLoss !== null ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3">
          <TrendingDown
            className={cn(
              "size-5",
              velocity.velocityLoss >= 0.25 ? "text-rose-400" : "text-amber-400",
            )}
            aria-hidden="true"
          />
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">Velocity loss</p>
            <p className="text-lg font-black text-white">
              {Math.round(velocity.velocityLoss * 100)}%
            </p>
          </div>
          <p className="ml-auto max-w-[55%] text-right text-[11px] leading-4 text-zinc-500">
            First rep {velocity.peak ?? "—"} {velocity.unit} → final rep {velocity.final ?? "—"}{" "}
            {velocity.unit}
          </p>
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        <div className="flex items-center gap-2">
          <Gauge className="size-3.5 text-zinc-500" aria-hidden="true" />
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            Technique consistency
          </p>
        </div>
        <ConsistencyBar label="ROM consistency" value={technique.romConsistency} />
        <ConsistencyBar label="Tempo consistency" value={technique.tempoConsistency} />
        <ConsistencyBar label="Bar-path consistency" value={technique.barPathConsistency} />
        {technique.asymmetryDeg !== null ? (
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-400">Left/right knee asymmetry</span>
            <span className="font-bold text-white">{technique.asymmetryDeg}°</span>
          </div>
        ) : null}
      </div>

      {analysis.perRep.rom.length > 0 ? (
        <div className="mt-6">
          <div className="flex items-center gap-2">
            <Waves className="size-3.5 text-zinc-500" aria-hidden="true" />
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              Per-rep detail
            </p>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead>
                <tr className="text-zinc-600">
                  <th className="py-1 pr-3 font-semibold">Rep</th>
                  <th className="py-1 pr-3 font-semibold">ROM</th>
                  <th className="py-1 pr-3 font-semibold">Eccentric</th>
                  <th className="py-1 pr-3 font-semibold">Pause</th>
                  <th className="py-1 pr-3 font-semibold">Concentric</th>
                </tr>
              </thead>
              <tbody>
                {analysis.perRep.rom.map((romEntry, i) => {
                  const tempoEntry = analysis.perRep.tempo[i];
                  return (
                    <tr key={romEntry.repNumber} className="border-t border-white/[0.05]">
                      <td className="py-1.5 pr-3 font-bold text-white">{romEntry.repNumber}</td>
                      <td className="py-1.5 pr-3 text-zinc-300">{romEntry.romPercent}%</td>
                      <td className="py-1.5 pr-3 text-zinc-300">
                        {tempoEntry ? `${tempoEntry.eccentricSec}s` : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-zinc-300">
                        {tempoEntry ? `${tempoEntry.pauseSec}s` : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-zinc-300">
                        {tempoEntry ? `${tempoEntry.concentricSec}s` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {analysis.limitations.length > 0 ? (
        <div className="mt-6 flex items-start gap-2 border-t border-white/[0.06] pt-4">
          <Timer className="mt-0.5 size-3.5 shrink-0 text-zinc-600" aria-hidden="true" />
          <ul className="space-y-1 text-xs leading-5 text-zinc-600">
            {analysis.limitations.map((limitation, i) => (
              <li key={i}>{limitation}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
