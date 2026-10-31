import { RECOVERY_STATUS_LABEL } from "@/lib/recovery/score";
import type { RecoveryScoreResult } from "@/lib/recovery/types";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, { text: string }> = {
  ready: { text: "text-emerald-300" },
  good: { text: "text-mf-glass-warning" },
  moderate: { text: "text-mf-glass-warning" },
  priority: { text: "text-mf-glass-danger" },
};

/**
 * Recovery's one verdict for today. Order of authority: a failed check-in read, then the Daily Brief's safety hold
 * (trainingHold), then a missing check-in, and only then the score. While a hold is set the score is shown as a plain
 * number, never as a coloured "ready" status that would read as permission to train.
 */
export function RecoveryScoreCard({
  result,
  recommendation,
  checkinUnavailable = false,
  hold = null,
  lastCheckin = null,
}: {
  result: RecoveryScoreResult;
  recommendation: string;
  /** The check-in read failed (RecoveryContext.checkinsUnavailable): no score is unknown, not "no check-in". */
  checkinUnavailable?: boolean;
  /** trainingHold(dailyDecision) — wins over the score, exactly as on Today and Training. */
  hold?: "recovery" | "unverified" | null;
  /** The most recent earlier check-in when today has none — shown as history, never as today's readiness. */
  lastCheckin?: { date: string; score: number | null } | null;
}) {
  const availableDrivers = result.drivers
    .filter((driver) => driver.available)
    .sort((a, b) => a.score - b.score);

  const verdict = checkinUnavailable
    ? { title: "Recovery status unavailable", tone: "text-mf-glass-warning" }
    : hold === "recovery"
      ? { title: "Recovery first today", tone: "text-mf-glass-warning" }
      : hold === "unverified"
        ? { title: "Training not cleared yet", tone: "text-mf-glass-warning" }
        : result.score === null
          ? { title: "No check-in yet today", tone: "text-mf-glass-text" }
          : { title: RECOVERY_STATUS_LABEL[result.status ?? "moderate"], tone: STATUS_TONE[result.status ?? "moderate"].text };

  return (
    <article
      aria-labelledby="recovery-verdict"
      className={cn(
        "rounded-2xl border-2 bg-mf-glass-surface p-5 sm:p-7",
        hold || checkinUnavailable ? "border-amber-400" : "border-mf-glass-text",
      )}
    >
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">Today&apos;s recovery</p>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 id="recovery-verdict" className={cn("font-heading text-3xl font-black uppercase leading-none tracking-tight sm:text-4xl", verdict.tone)}>
          {verdict.title}
        </h2>
        {/* The V4 ring only when nothing holds training; under a hold the score stays a plain number. */}
        {!checkinUnavailable && result.score !== null && !hold ? (
          <p className="flex items-center gap-3 text-sm text-mf-glass-text-muted">
            Check-in score
            <span className="grid size-16 place-items-center rounded-full border-4 border-mf-glass-text bg-mf-glass-bg font-heading text-2xl font-black tabular-nums text-mf-glass-text">
              {result.score}
            </span>
            <span className="sr-only">out of 100</span>
          </p>
        ) : !checkinUnavailable && result.score !== null ? (
          <p className="text-sm text-mf-glass-text-muted">
            Check-in score <span className="text-lg font-black text-mf-glass-text">{result.score}</span>/100
          </p>
        ) : null}
      </div>

      {checkinUnavailable ? (
        <p role="status" className="mt-3 text-sm leading-6 text-mf-glass-text-secondary">
          Recovery check-in couldn&apos;t be loaded. No score is shown and
          nothing is assumed — reload the page to try again. Until it loads,
          Dante won&apos;t recommend a training session.
        </p>
      ) : result.score === null && !hold ? (
        <p className="mt-3 text-sm leading-6 text-mf-glass-text-secondary">
          No check-in recorded today. Complete the daily recovery check-in to
          calculate a practical readiness estimate based on the information you provide.
        </p>
      ) : (
        <p className="mt-3 text-sm leading-6 text-mf-glass-text-secondary">{recommendation}</p>
      )}

      {hold && result.score !== null && !checkinUnavailable ? (
        <p className="mt-2 text-xs leading-5 text-mf-glass-text-muted">
          The check-in score describes how you feel; it doesn&apos;t clear training while this hold is in place.
        </p>
      ) : null}

      {lastCheckin && result.score === null && !checkinUnavailable ? (
        <p className="mt-2 text-xs leading-5 text-mf-glass-text-muted">
          Last check-in: {lastCheckin.date}
          {lastCheckin.score !== null ? ` (score ${lastCheckin.score}/100)` : ""} — that is not today&apos;s readiness.
        </p>
      ) : null}

      {!checkinUnavailable && availableDrivers.length > 0 ? (
        <div className="mt-5 border-t border-mf-glass-border pt-4">
          <p className="mb-2.5 text-xs font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">
            From today&apos;s check-in
          </p>
          <ul className="space-y-2">
            {availableDrivers.map((driver) => (
              <li key={driver.key} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3">
                <span className="truncate text-xs text-mf-glass-text-secondary">{driver.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden="true">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      driver.score >= 70 ? "bg-emerald-400" : driver.score >= 50 ? "bg-mf-glass-warning" : "bg-mf-glass-danger",
                    )}
                    style={{ width: `${driver.score}%` }}
                  />
                </span>
                <span className="text-right text-xs font-semibold text-mf-glass-text-secondary">{driver.score}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.baseline && !checkinUnavailable && result.score !== null ? (
        <p className="mt-3 text-xs text-mf-glass-text-muted">
          {result.baseline.trend === "above"
            ? `+${result.baseline.deltaFromToday} vs your recent baseline`
            : result.baseline.trend === "below"
              ? `${result.baseline.deltaFromToday} vs your recent baseline`
              : "In line with your recent baseline"}
        </p>
      ) : null}

      <p className="mt-4 text-xs leading-5 text-mf-glass-text-muted">
        A practical readiness estimate based on the recovery information you
        provide — not a validated medical biomarker.
      </p>
    </article>
  );
}
