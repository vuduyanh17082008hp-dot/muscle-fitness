import { CapabilityBadge } from "@/components/setvision/exercise-picker";
import type { AnalysisCapability } from "@/lib/setvision/exercise-selection";
import { referenceFor } from "@/lib/setvision/exercise-selection";
import { VISUAL_STATUS_TEXT, type VisualObservation, type VisualReviewStatus } from "@/lib/setvision/visual-review";
import { cn } from "@/lib/utils";

const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function Times({ atMs, onSeek }: { atMs: number[]; onSeek: (ms: number) => void }) {
  if (atMs.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1.5">
      {atMs.slice(0, 4).map((ms) => (
        <button
          key={ms}
          type="button"
          onClick={() => onSeek(ms)}
          className="text-xs font-semibold text-zinc-200 underline decoration-dotted underline-offset-2 hover:text-white"
          aria-label={`Replay from ${sec(ms)}`}
        >
          ▶ {sec(ms)}
        </button>
      ))}
    </span>
  );
}

/**
 * The first thing a user reads after analysis: what was analysed, how, the
 * verified reps (tracked only), the one improvement that matters most, one
 * positive, replay links and the reference. Everything else lives below in
 * Advanced metrics.
 */
export function ReviewSummary({
  title,
  label,
  capability,
  reps,
  status,
  observations,
  note,
  filmingTip,
  exerciseKey,
  onSeek,
  confirmExercise,
  testId,
}: {
  title: string;
  label: string;
  capability: AnalysisCapability;
  /** Tracked rep count; null when nothing is counted (AI review never counts). */
  reps: { count: number; verified: boolean } | null;
  status: VisualReviewStatus;
  observations: VisualObservation[];
  note: string | null;
  filmingTip?: string | null;
  exerciseKey: string | null;
  onSeek: (ms: number) => void;
  /** Shown when the video couldn't confirm the exercise: the user can say it is this exercise (never overrides a confirmed mismatch). */
  confirmExercise?: () => void;
  testId: string;
}) {
  const issues = observations.filter((o) => o.kind === "issue");
  const positive = observations.find((o) => o.kind === "positive");
  const uncertain = observations.filter((o) => o.kind === "uncertain");
  const reference = referenceFor(exerciseKey);

  return (
    <article className="rounded-3xl border border-white/10 bg-mf-surface p-6 sm:p-8" data-testid={testId} data-status={status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">{title}</p>
        <CapabilityBadge capability={capability} />
      </div>
      <h3 className="mt-2 break-words text-lg font-black text-white">
        {label}
        {reps ? ` — ${reps.count} rep${reps.count === 1 ? "" : "s"}${reps.verified ? "" : " (unverified)"}` : ""}
      </h3>
      <p
        className={cn(
          "mt-1 text-sm font-bold",
          status === "OBSERVED_ISSUE" ? "text-amber-300" : status === "NOT_ASSESSABLE" ? "text-rose-300" : "text-zinc-300",
        )}
        data-testid={`${testId}-status`}
      >
        {VISUAL_STATUS_TEXT[status]}
      </p>

      {issues.length > 0 ? (
        <div className="mt-4 space-y-3">
          {issues.map((o, i) => (
            <div key={i} className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3" data-testid={`${testId}-issue`}>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-300">{i === 0 ? "Most important fix" : "Also seen"}</p>
              <p className="mt-1 text-sm leading-6 text-zinc-200">
                {o.what}
                <Times atMs={o.atMs} onSeek={onSeek} />
              </p>
              {o.cue ? <p className="mt-1 text-sm font-semibold text-white">Try: {o.cue}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {positive ? (
        <p className="mt-3 text-sm leading-6 text-emerald-300" data-testid={`${testId}-positive`}>
          ✓ {positive.what}
          <Times atMs={positive.atMs} onSeek={onSeek} />
        </p>
      ) : null}

      {uncertain.map((o, i) => (
        <p key={i} className="mt-3 text-sm leading-6 text-zinc-400" data-testid={`${testId}-uncertain`}>
          <span className="font-semibold text-zinc-300">Possible technique observation — review the footage.</span> {o.what}
          <Times atMs={o.atMs} onSeek={onSeek} />
        </p>
      ))}

      {note ? <p className="mt-3 text-xs leading-5 text-zinc-500" data-testid={`${testId}-note`}>{note}</p> : null}
      {confirmExercise ? (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid={`${testId}-confirm`}>
          <button
            type="button"
            onClick={confirmExercise}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-amber-400"
          >
            Yes, it&apos;s {label}
          </button>
          <span className="text-xs text-zinc-500">Not {label}? Change the exercise above.</span>
        </div>
      ) : null}
      {filmingTip ? <p className="mt-2 text-xs leading-5 text-zinc-400">Better clip: {filmingTip}</p> : null}
      {status === "NO_SUPPORTED_ISSUE_OBSERVED" ? (
        <p className="mt-2 text-xs leading-5 text-zinc-500">Not seeing an issue isn&apos;t the same as perfect form.</p>
      ) : null}

      {reference ? (
        <a href={reference.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-semibold text-zinc-200 underline underline-offset-2 hover:text-white">
          External demonstration: {reference.source} ↗
        </a>
      ) : null}
    </article>
  );
}
