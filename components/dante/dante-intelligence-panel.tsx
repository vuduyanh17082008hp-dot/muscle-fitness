import Link from "next/link";
import type { ReactNode } from "react";
import { Sparkles, ChevronDown } from "lucide-react";

/**
 * Dante as an intelligence layer, not chatbot decoration: a
 * recommendation, the real reasons behind it, and a confidence level
 * only when one is actually available — never a fabricated number.
 *
 * No client JS needed here (the "Why" disclosure uses native
 * <details>), so this stays a server component fed real data
 * computed by the dashboard page (Dante Core's readiness engine +
 * the cached daily-intelligence narrative) rather than re-fetching
 * client-side.
 *
 * `actions` is the extension point: a future [APPLY] / [MODIFY
 * WORKOUT] Dante Action renders here without touching this
 * component's layout.
 */

export type DanteIntelligencePanelProps = {
  recommendation: string;
  why: string[];
  /** 0-1, or null when Dante Core had too little input to state one. */
  confidence: number | null;
  actions?: ReactNode;
};

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.66) return "High confidence";
  if (confidence >= 0.33) return "Moderate confidence";
  return "Limited data";
}

export function DanteIntelligencePanel({
  recommendation,
  why,
  confidence,
  actions,
}: DanteIntelligencePanelProps) {
  return (
    <section className="rounded-[20px] border border-amber-400/15 bg-gradient-to-br from-amber-400/[0.05] to-transparent p-6 sm:p-7">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-amber-400" aria-hidden="true" />
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-400">Dante</p>
      </div>

      <p className="mt-3 text-lg font-semibold leading-7 text-white sm:text-xl">{recommendation}</p>

      {why.length > 0 ? (
        <details className="group mt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-zinc-500 transition-colors duration-200 hover:text-zinc-300">
            Why
            <ChevronDown className="size-3.5 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <ul className="mt-2 space-y-1.5 border-l border-white/10 pl-3">
            {why.map((reason) => (
              <li key={reason} className="text-sm leading-6 text-zinc-400">
                {reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/ai-coach"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-400 px-4 text-sm font-black text-black transition-colors duration-200 hover:bg-amber-300"
        >
          Ask Dante
        </Link>

        {actions}

        {confidence !== null ? (
          <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-600">
            {confidenceLabel(confidence)}
          </span>
        ) : null}
      </div>
    </section>
  );
}
