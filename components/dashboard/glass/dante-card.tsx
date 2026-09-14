import Link from "next/link";
import { ChevronDown } from "lucide-react";

import type { TraceableDecision } from "@/lib/dante-core/types";
import type { DailyDecision } from "@/lib/dante-core/daily-decision-engine";
import { DanteMascot } from "@/components/dante/dante-mascot";
import { GlassCard, GlassCardHeader } from "@/components/dashboard/glass/glass-card";

export type DanteCardProps = {
  /** Null only when Dante's decision layer genuinely failed to load — never a fabricated fallback decision. */
  decision: TraceableDecision<DailyDecision> | null;
  narrative?: string | null;
};

export function DanteCard({ decision, narrative }: DanteCardProps) {
  if (!decision) {
    return (
      <GlassCard data-testid="dante-card">
        <GlassCardHeader title="Dante" />

        <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <DanteMascot size="sm" state="idle" ariaLabel="Dante" />
          <p className="mt-2 text-sm text-mf-glass-text-muted">Dante is temporarily unavailable.</p>
          <p className="text-xs text-mf-glass-text-muted">Your logged data has not been changed.</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard data-testid="dante-card">
      <GlassCardHeader
        title="Dante"
        icon={undefined}
        action={<DanteMascot size="xs" state="idle" ariaLabel="Dante" />}
      />

      <div className="mt-3 flex-1">
        <p className="text-sm font-semibold leading-6 text-mf-glass-text">{decision.recommendation}</p>

        {narrative ? (
          <p className="mt-2 text-xs leading-5 text-mf-glass-text-muted">{narrative}</p>
        ) : null}
      </div>

      {decision.why.length > 0 ? (
        <details className="group mt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-mf-glass-dante">
            Why This?
            <ChevronDown className="size-3 transition group-open:rotate-180" aria-hidden="true" />
          </summary>

          <ul className="mt-2 space-y-1.5">
            {decision.why.slice(0, 3).map((reason, index) => (
              <li key={index} className="text-xs leading-5 text-mf-glass-text-secondary">
                • {reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Link
        href="/dashboard/ai-coach"
        className="mt-4 flex h-10 w-full items-center justify-center rounded-xl bg-mf-glass-dante/15 text-xs font-bold uppercase tracking-[0.08em] text-violet-200 transition hover:bg-mf-glass-dante/25"
      >
        Ask Dante
      </Link>
    </GlassCard>
  );
}
