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
  moderate: "border-mf-glass-warning/25 bg-mf-glass-warning/10 text-mf-glass-warning",
  low: "border-mf-glass-border-strong bg-white/[0.04] text-mf-glass-text-muted",
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
    <article className="rounded-3xl border border-mf-glass-border bg-mf-glass-surface p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-mf-glass-dante" aria-hidden="true" />
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-mf-glass-text-muted">
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

      <h3 className="mt-4 text-lg font-black leading-snug text-mf-glass-text">
        {decision.recommendation}
      </h3>

      {explanation ? (
        <p className="mt-2 text-sm leading-6 text-mf-glass-text-secondary">{explanation}</p>
      ) : null}

      {decision.why.length > 0 ? (
        <div className="mt-5">
          <div className="flex items-center gap-2">
            <ListChecks className="size-3.5 text-mf-glass-text-muted" aria-hidden="true" />
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-mf-glass-text-muted">
              Why
            </p>
          </div>
          <ul className="mt-2 space-y-1.5">
            {decision.why.map((reason, i) => (
              <li key={i} className="text-sm leading-6 text-mf-glass-text-secondary">
                • {reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dataEntries.length > 0 ? (
        <div className="mt-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-mf-glass-text-muted">
            Data used
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {dataEntries.map(([key, value]) => (
              <div
                key={key}
                className="rounded-xl border border-mf-glass-border bg-mf-glass-bg-deep p-2.5"
              >
                <p className="text-[9px] uppercase tracking-[0.12em] text-mf-glass-text-muted">
                  {formatDataLabel(key)}
                </p>
                <p className="mt-0.5 text-sm font-bold text-mf-glass-text">
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
            <BookOpen className="size-3.5 text-mf-glass-text-muted" aria-hidden="true" />
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-mf-glass-text-muted">
              Sources
            </p>
          </div>
          <ul className="mt-2 space-y-1">
            {decision.sources.map((source) => (
              <li key={source.id} className="text-xs leading-5 text-mf-glass-text-muted">
                {source.title} — {source.authors}, {source.source} ({source.year})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {decision.limitations && decision.limitations.length > 0 ? (
        <div className="mt-5 rounded-xl border border-mf-glass-border bg-mf-glass-bg-deep p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-mf-glass-text-muted">
            Limitations
          </p>
          <ul className="mt-1.5 space-y-1">
            {decision.limitations.map((limitation, i) => (
              <li key={i} className="text-xs leading-5 text-mf-glass-text-muted">
                • {limitation}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
