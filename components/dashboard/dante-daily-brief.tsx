import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DanteAvatar } from "@/components/dante/dante-avatar";
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
    <article className="rounded-2xl border-2 border-mf-glass-dante/40 bg-violet-950/70 p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DanteAvatar size="sm" />
          <h3 className="font-heading text-xl font-black uppercase tracking-tight text-mf-glass-dante">
            Dante Daily Brief
          </h3>
        </div>

        <Link
          href="/dashboard/ai-coach"
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md bg-mf-glass-dante px-3 text-sm font-bold text-mf-glass-bg hover:opacity-90"
        >
          Ask Dante <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="mt-3">
        <p className="text-sm leading-relaxed text-mf-glass-text sm:text-base">
          {briefText}
        </p>

        {decision?.why && decision.why.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {decision.why.map((reason, idx) => (
              <span
                key={idx}
                className="rounded-md border border-mf-glass-dante/20 bg-mf-glass-surface px-2 py-1 text-xs text-mf-glass-text-secondary"
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
