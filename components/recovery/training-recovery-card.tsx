import { Dumbbell } from "lucide-react";

import type { TrainingLoadSummary } from "@/lib/recovery/types";
import { cn } from "@/lib/utils";

const STATE_STYLES: Record<
  TrainingLoadSummary["state"],
  { label: string; chip: string; dot: string }
> = {
  green: {
    label: "GREEN — Train normally",
    chip: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    dot: "bg-emerald-400",
  },
  amber: {
    label: "AMBER — Maintain quality, trim volume",
    chip: "border-mf-glass-warning/25 bg-mf-glass-warning/10 text-mf-glass-warning",
    dot: "bg-mf-glass-warning",
  },
  red: {
    label: "RED — Prioritise recovery",
    chip: "border-rose-400/25 bg-rose-400/10 text-rose-300",
    dot: "bg-rose-400",
  },
};

// trainingHold(dailyDecision): the load chip is a training directive, so it yields to the Daily Brief's safety hold.
const HOLD_STYLES: Record<"recovery" | "unverified", { label: string; chip: string; dot: string; reason: string }> = {
  recovery: {
    label: "On hold — Recovery first",
    chip: "border-mf-glass-warning/25 bg-mf-glass-warning/10 text-mf-glass-warning",
    dot: "bg-mf-glass-warning",
    reason: "Your check-in flagged pain or illness, so training is on hold today regardless of training load.",
  },
  unverified: {
    label: "Check recovery first",
    chip: "border-mf-glass-warning/25 bg-mf-glass-warning/10 text-mf-glass-warning",
    dot: "bg-mf-glass-warning",
    reason: "Today's pain/illness check-in couldn't be confirmed, so training load alone doesn't clear a session.",
  },
};

export function TrainingRecoveryCard({
  summary,
  hold = null,
  signalsOnly = false,
}: {
  summary: TrainingLoadSummary;
  hold?: "recovery" | "unverified" | null;
  /** The Recovery page states the one verdict elsewhere: show the 7-day load facts only, no second directive chip. */
  signalsOnly?: boolean;
}) {
  const style = hold ? HOLD_STYLES[hold] : STATE_STYLES[summary.state];
  const reason = hold ? HOLD_STYLES[hold].reason : summary.reason;

  return (
    <article className="rounded-3xl border border-mf-glass-border bg-mf-glass-surface p-5 sm:p-7">
      <div className="flex items-center gap-2">
        <Dumbbell className="size-4 text-mf-glass-brand" aria-hidden="true" />
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-mf-glass-text-muted">
          {signalsOnly ? "Training load · last 7 days" : "Training × Recovery"}
        </p>
      </div>

      {signalsOnly ? null : (
      <>
      <div
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em]",
          style.chip,
        )}
      >
        <span className={cn("size-1.5 rounded-full", style.dot)} />
        {style.label}
      </div>

      <p className="mt-4 text-sm leading-6 text-mf-glass-text-muted">{reason}</p>
      </>
      )}

      <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", signalsOnly ? "mt-4" : "mt-6")}>
        <div className="rounded-xl border border-mf-glass-border bg-mf-glass-bg-deep p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-mf-glass-text-muted">
            Sessions / 7d
          </p>
          <p className="mt-1 text-lg font-black text-mf-glass-text">
            {summary.sessionsLast7Days}
          </p>
        </div>

        <div className="rounded-xl border border-mf-glass-border bg-mf-glass-bg-deep p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-mf-glass-text-muted">
            Rest days / 7d
          </p>
          <p className="mt-1 text-lg font-black text-mf-glass-text">
            {summary.restDaysLast7Days}
          </p>
        </div>

        <div className="rounded-xl border border-mf-glass-border bg-mf-glass-bg-deep p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-mf-glass-text-muted">
            Avg RPE
          </p>
          <p className="mt-1 text-lg font-black text-mf-glass-text">
            {summary.averageSessionRpe ?? "—"}
          </p>
        </div>

        <div className="rounded-xl border border-mf-glass-border bg-mf-glass-bg-deep p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-mf-glass-text-muted">
            Last session
          </p>
          <p className="mt-1 text-lg font-black text-mf-glass-text">
            {summary.lastSessionDaysAgo === null
              ? "—"
              : summary.lastSessionDaysAgo === 0
                ? "Today"
                : `${summary.lastSessionDaysAgo}d ago`}
          </p>
        </div>
      </div>
    </article>
  );
}
