import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import type { TraceableDecision } from "@/lib/dante-core/types";
import type { DailyDecision } from "@/lib/dante-core/daily-decision-engine";

export type DanteDailyBriefProps = {
  narrative: string | null;
  decision: TraceableDecision<DailyDecision> | null;
};

export function DanteDailyBrief({ narrative, decision }: DanteDailyBriefProps) {
  // The Daily Decision Engine is the training authority; the cached narrative is phrasing from earlier in the
  // day and may predate a completed or postponed session. No decision = its safety inputs failed: the dashboard holds
  // training (trainingHold), so the Brief says that rather than voicing the narrative as clearance.
  const briefText = decision
    ? decision.recommendation || narrative || "Dante is ready to assist with today's training adaptation and nutrition balancing."
    : "Today's training decision couldn't be loaded — check Recovery for pain or illness before you train.";

  return (
    <article className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#131522] to-mf-glass-surface p-5 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-mf-glass-dante" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-mf-glass-text">
            Dante Daily Brief
          </h3>
        </div>

        <Link
          href="/dashboard/ai-coach"
          className="-my-3 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-mf-glass-dante hover:underline"
        >
          Ask Dante <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="mt-3">
        <p className="text-sm leading-relaxed text-zinc-300">
          {briefText}
        </p>

        {decision?.why && decision.why.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {decision.why.map((reason, idx) => (
              <span
                key={idx}
                className="rounded-md border border-white/5 bg-white/[0.04] px-2 py-0.5 text-[11px] text-mf-glass-text-muted"
              >
                {reason}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
