import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import type { TraceableDecision } from "@/lib/dante-core/types";
import type { DailyDecision } from "@/lib/dante-core/daily-decision-engine";

export type DanteDailyBriefProps = {
  narrative: string | null;
  decision: TraceableDecision<DailyDecision> | null;
};

export function DanteDailyBrief({ narrative, decision }: DanteDailyBriefProps) {
  // Grounded takeaway without sci-fi holograms
  const briefText =
    narrative ||
    decision?.recommendation ||
    "Dante is ready to assist with today's training adaptation and nutrition balancing.";

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
          className="inline-flex items-center gap-1 text-xs font-semibold text-mf-glass-dante hover:underline"
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
