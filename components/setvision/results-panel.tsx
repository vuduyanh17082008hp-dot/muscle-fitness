import { Activity, Gauge, Timer, TrendingDown, Waves } from "lucide-react";

import { MANUAL_SELECTION_SIGNAL } from "@/lib/setvision/analyze";
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
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-zinc-500">{sub}</p> : null}
    </div>
  );
}

function ConsistencyBar({
  label,
  value,
  unavailableText,
}: {
  label: string;
  value: number | null;
  unavailableText: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-zinc-400">{label}</span>
        <span className={value === null ? "text-right text-zinc-500" : "font-bold text-white"}>
          {value === null ? unavailableText : `${Math.round(value * 100)}%`}
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

const seconds = (ms: number | null) => (ms === null ? null : `${(ms / 1000).toFixed(1)} s`);

function average(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? Math.round((present.reduce((x, y) => x + y, 0) / present.length) * 100) / 100 : null;
}

/** Coarse band for the UNCALIBRATED heuristic score — never shown as a % likelihood. */
function qualityBand(score: number): string {
  if (score >= 0.75) return "Higher";
  if (score >= 0.5) return "Moderate";
  return "Low";
}

function TimestampButton({ ms, onSeek }: { ms: number | null; onSeek?: (ms: number) => void }) {
  if (ms === null) return <span className="text-zinc-600">not observed</span>;
  const label = seconds(ms);
  if (!onSeek) return <span>{label}</span>;
  return (
    <button
      type="button"
      onClick={() => onSeek(ms)}
      className="font-semibold text-zinc-200 underline decoration-dotted underline-offset-2 hover:text-white"
      aria-label={`Jump video to ${label}`}
    >
      {label}
    </button>
  );
}

export function SetVisionResultsPanel({
  analysis,
  onSeek,
}: {
  analysis: SetVisionAnalysis;
  onSeek?: (ms: number) => void;
}) {
  const { velocity, technique, exerciseClassification: classification } = analysis;
  const identified = classification.exercise !== null;
  const manual = classification.signals[0] === MANUAL_SELECTION_SIGNAL;
  const tempos = analysis.perRep.tempo;
  const notEnoughReps = analysis.reps < 2 ? "Not enough reps (needs 2+)" : "Unavailable";
  const avgHold = average(tempos.map((t) => t.pauseSec));

  return (
    <article className="rounded-3xl border border-white/10 bg-mf-surface p-6 sm:p-8" data-testid="sv-result">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-amber-400" aria-hidden="true" />
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
            SetVision analysis
          </p>
        </div>
        {identified ? (
          <span
            className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-bold uppercase tracking-[0.1em] text-zinc-400"
            title="Heuristic score from tracking visibility, rep count and torso visibility. Not calibrated, not a probability."
          >
            Signal quality: {qualityBand(analysis.confidence)}
          </span>
        ) : null}
      </div>

      <h3 className="mt-3 text-lg font-black text-white" data-testid="sv-result-title">
        {identified
          ? `${analysis.exercise.replace("_", " ")} — ${analysis.reps} rep${analysis.reps === 1 ? "" : "s"}`
          : "Exercise not identified"}
      </h3>

      <p className="mt-1 text-xs leading-5 text-zinc-500" data-testid="sv-classification">
        {!identified
          ? `${classification.signals[0] ?? "The exercise could not be identified."} Choose it in the selector above and analyse again.`
          : manual
            ? "Exercise selected by you — not auto-detected."
            : `Auto-detected (heuristic match, not a calibrated probability) — ${classification.signals[0] ?? ""}`}
      </p>

      {identified ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Reps" value={String(analysis.reps)} sub="Observed down-and-up cycles" />
            <StatTile
              label="Avg eccentric"
              value={analysis.averageEccentricTime !== null ? `${analysis.averageEccentricTime}s` : "—"}
              sub={analysis.averageEccentricTime === null ? "Not observed" : "Lowering phase"}
            />
            <StatTile
              label="Avg bottom hold"
              value={avgHold !== null ? `${avgHold}s` : "—"}
              sub={avgHold === null ? "Not observed" : "Not counted in eccentric/concentric"}
            />
            <StatTile
              label="Avg concentric"
              value={analysis.averageConcentricTime !== null ? `${analysis.averageConcentricTime}s` : "—"}
              sub={analysis.averageConcentricTime === null ? "Not observed" : "Rising phase"}
            />
            <StatTile
              label={velocity.calibrated ? "Mean velocity" : "Mean speed (normalized)"}
              value={velocity.mean !== null ? `${velocity.mean} ${velocity.unit}` : "—"}
              sub={velocity.calibrated ? undefined : "2D, not calibrated — not m/s"}
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
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">Velocity loss</p>
            <p className="text-lg font-black text-white">
              {Math.round(velocity.velocityLoss * 100)}%
            </p>
          </div>
          <p className="ml-auto max-w-[55%] text-right text-xs leading-4 text-zinc-500">
            First rep {velocity.peak ?? "—"} {velocity.unit} → final rep {velocity.final ?? "—"}{" "}
            {velocity.unit}
          </p>
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        <div className="flex items-center gap-2">
          <Gauge className="size-3.5 text-zinc-500" aria-hidden="true" />
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
            Technique consistency
          </p>
        </div>
        <ConsistencyBar label="ROM consistency" value={technique.romConsistency} unavailableText={notEnoughReps} />
        <ConsistencyBar label="Tempo consistency" value={technique.tempoConsistency} unavailableText={notEnoughReps} />
        <ConsistencyBar label="Bar-path consistency" value={technique.barPathConsistency} unavailableText={notEnoughReps} />
        {technique.asymmetryDeg !== null ? (
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-400">Left/right knee asymmetry</span>
            <span className="font-bold text-white">{technique.asymmetryDeg}°</span>
          </div>
        ) : null}
      </div>

      {tempos.length > 0 ? (
        <div className="mt-6">
          <div className="flex items-center gap-2">
            <Waves className="size-3.5 text-zinc-500" aria-hidden="true" />
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
              Rep timeline
            </p>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            Video time where each phase began{onSeek ? " — select a time to jump there" : ""}. A phase is
            detected when the joint angle crosses a threshold, so it can trail the visible start of a movement by a few tenths of a second.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs" data-testid="sv-rep-timeline">
              <thead>
                <tr className="text-zinc-600">
                  <th className="py-1 pr-3 font-semibold">Rep</th>
                  <th className="py-1 pr-3 font-semibold">Descent</th>
                  <th className="py-1 pr-3 font-semibold">Bottom</th>
                  <th className="py-1 pr-3 font-semibold">Ascent</th>
                  <th className="py-1 pr-3 font-semibold">Standing</th>
                  <th className="py-1 pr-3 font-semibold">Ecc / hold / con</th>
                  <th className="py-1 pr-3 font-semibold">ROM</th>
                </tr>
              </thead>
              <tbody>
                {tempos.map((t) => {
                  const rom = analysis.perRep.rom.find((r) => r.repNumber === t.repNumber);
                  return (
                    <tr key={t.repNumber} className="border-t border-white/[0.05] text-zinc-300">
                      <td className="py-1.5 pr-3 font-bold text-white">{t.repNumber}</td>
                      <td className="py-1.5 pr-3"><TimestampButton ms={t.descentStartMs} onSeek={onSeek} /></td>
                      <td className="py-1.5 pr-3"><TimestampButton ms={t.bottomReachedMs} onSeek={onSeek} /></td>
                      <td className="py-1.5 pr-3"><TimestampButton ms={t.ascentStartMs} onSeek={onSeek} /></td>
                      <td className="py-1.5 pr-3"><TimestampButton ms={t.repEndMs} onSeek={onSeek} /></td>
                      <td className="whitespace-nowrap py-1.5 pr-3">
                        {t.eccentricSec ?? "—"}s / {t.pauseSec ?? "—"}s / {t.concentricSec}s
                      </td>
                      <td className="py-1.5 pr-3">{rom ? `${rom.romPercent}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
        </>
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
