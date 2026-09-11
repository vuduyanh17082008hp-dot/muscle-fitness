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
    chip: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    dot: "bg-amber-400",
  },
  red: {
    label: "RED — Prioritise recovery",
    chip: "border-rose-400/25 bg-rose-400/10 text-rose-300",
    dot: "bg-rose-400",
  },
};

export function TrainingRecoveryCard({
  summary,
}: {
  summary: TrainingLoadSummary;
}) {
  const style = STATE_STYLES[summary.state];

  return (
    <article className="rounded-3xl border border-white/10 bg-[#0d0f12] p-6 sm:p-8">
      <div className="flex items-center gap-2">
        <Dumbbell className="size-4 text-amber-400" aria-hidden="true" />
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
          Training × Recovery
        </p>
      </div>

      <div
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em]",
          style.chip,
        )}
      >
        <span className={cn("size-1.5 rounded-full", style.dot)} />
        {style.label}
      </div>

      <p className="mt-4 text-sm leading-6 text-zinc-400">{summary.reason}</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            Sessions / 7d
          </p>
          <p className="mt-1 text-lg font-black text-white">
            {summary.sessionsLast7Days}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            Rest days / 7d
          </p>
          <p className="mt-1 text-lg font-black text-white">
            {summary.restDaysLast7Days}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            Avg RPE
          </p>
          <p className="mt-1 text-lg font-black text-white">
            {summary.averageSessionRpe ?? "—"}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            Last session
          </p>
          <p className="mt-1 text-lg font-black text-white">
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
