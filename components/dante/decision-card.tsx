import { BookOpen, Gauge, ListChecks, Sparkles } from "lucide-react";

import type { TraceableDecision } from "@/lib/dante-core/types";
import { cn } from "@/lib/utils";

/**
 * Generic Decision Traceability card (spec Part A §6, §11).
 *
 * Renders any Dante Core TraceableDecision — autoregulation, and
 * later readiness/other decisions — as Recommendation / Why / Data
 * Used / Confidence / Sources. No Dante Core decision should ever be
 * shown to a user as an opaque number; this is the one place that
 * rule is enforced in the UI layer.
 */

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  moderate: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  low: "border-zinc-500/25 bg-zinc-500/10 text-zinc-400",
};

function formatDataValue(value: string | number | null): string {
  if (value === null) return "—";
  if (typeof value === "number") return String(value);
  return value;
}

function formatDataLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export function DecisionCard<TDecision>({
  decision,
  explanation,
}: {
  decision: TraceableDecision<TDecision>;
  /** Optional LLM-generated natural-language explanation (spec §9). Never required — the card is fully meaningful without it. */
  explanation?: string | null;
}) {
  const confidenceStyle =
    CONFIDENCE_STYLES[decision.confidence] ?? CONFIDENCE_STYLES.low;

  const dataEntries = Object.entries(decision.dataUsed).filter(
    ([, value]) => value !== null,
  );

  return (
    <article className="rounded-3xl border border-white/10 bg-[#0d0f12] p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-amber-400" aria-hidden="true" />
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
            Dante recommendation
          </p>
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
            confidenceStyle,
          )}
        >
          <Gauge className="size-3" aria-hidden="true" />
          {decision.confidence} confidence
        </span>
      </div>

      <h3 className="mt-4 text-lg font-black leading-snug text-white">
        {decision.recommendation}
      </h3>

      {explanation ? (
        <p className="mt-2 text-sm leading-6 text-zinc-400">{explanation}</p>
      ) : null}

      {decision.why.length > 0 ? (
        <div className="mt-5">
          <div className="flex items-center gap-2">
            <ListChecks className="size-3.5 text-zinc-500" aria-hidden="true" />
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              Why
            </p>
          </div>
          <ul className="mt-2 space-y-1.5">
            {decision.why.map((reason, i) => (
              <li key={i} className="text-sm leading-6 text-zinc-300">
                • {reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dataEntries.length > 0 ? (
        <div className="mt-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            Data used
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {dataEntries.map(([key, value]) => (
              <div
                key={key}
                className="rounded-xl border border-white/[0.07] bg-black/20 p-2.5"
              >
                <p className="text-[9px] uppercase tracking-[0.12em] text-zinc-600">
                  {formatDataLabel(key)}
                </p>
                <p className="mt-0.5 text-sm font-bold text-white">
                  {formatDataValue(value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {decision.sources.length > 0 ? (
        <div className="mt-5">
          <div className="flex items-center gap-2">
            <BookOpen className="size-3.5 text-zinc-500" aria-hidden="true" />
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              Sources
            </p>
          </div>
          <ul className="mt-2 space-y-1">
            {decision.sources.map((source) => (
              <li key={source.id} className="text-xs leading-5 text-zinc-500">
                {source.title} — {source.authors}, {source.source} ({source.year})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
