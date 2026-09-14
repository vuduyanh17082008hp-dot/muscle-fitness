"use client";

import { useEffect, useState } from "react";
import { Activity, AlertCircle } from "lucide-react";

import { MUSCLE_DISPLAY_NAME } from "@/lib/training/muscle-taxonomy";
import type { ReadinessResult } from "@/lib/dante-core/types";
import { cn } from "@/lib/utils";

/**
 * Readiness panel (spec Part A §3 UI). Fetches Dante Core's readiness
 * engine output for the current user (/api/dante/readiness) and
 * renders the exact concept from the spec:
 *
 *   READINESS  68/100
 *   Chest 58%  Back 87%  Quads 79%
 *   Systemic fatigue: HIGH
 *
 * Labeled honestly as an estimate — see the footnote — never
 * presented as a validated physiological measurement.
 */

const FATIGUE_STYLES: Record<string, { label: string; className: string }> = {
  low: { label: "LOW", className: "text-emerald-300" },
  moderate: { label: "MODERATE", className: "text-mf-glass-warning" },
  high: { label: "HIGH", className: "text-rose-300" },
  unknown: { label: "UNKNOWN", className: "text-mf-glass-text-muted" },
};

function barColor(percent: number): string {
  if (percent >= 75) return "bg-emerald-400";
  if (percent >= 50) return "bg-mf-glass-warning";
  return "bg-rose-400";
}

export function MuscleReadinessPanel() {
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/dante/readiness");
        const data = await response.json();

        if (cancelled) return;

        if (!response.ok || !data.ok) {
          setStatus("error");
          return;
        }

        setReadiness(data.readiness as ReadinessResult);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return (
      <article className="rounded-3xl border border-mf-glass-border bg-mf-glass-surface p-6 sm:p-8">
        <p className="text-sm text-mf-glass-text-muted">Loading readiness…</p>
      </article>
    );
  }

  if (status === "error" || !readiness) {
    return null;
  }

  const fatigue = FATIGUE_STYLES[readiness.systemicFatigue];
  const musclesWithData = readiness.muscleRecovery.filter(
    (m) => m.recoveryPercent !== null,
  );

  return (
    <article className="rounded-3xl border border-mf-glass-border bg-mf-glass-surface p-6 sm:p-8">
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-mf-glass-dante" aria-hidden="true" />
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-mf-glass-text-muted">
          Dante Core — Readiness
        </p>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-black text-mf-glass-text">
            {readiness.readinessScore ?? "—"}
          </span>
          <span className="text-sm font-bold text-mf-glass-text-muted">/100</span>
        </div>

        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.14em] text-mf-glass-text-muted">
            Systemic fatigue
          </p>
          <p className={cn("text-sm font-black", fatigue.className)}>
            {fatigue.label}
          </p>
        </div>
      </div>

      {musclesWithData.length > 0 ? (
        <div className="mt-6 space-y-2.5">
          {musclesWithData.map((muscle) => (
            <div key={muscle.muscle} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs font-semibold text-mf-glass-text-secondary">
                {MUSCLE_DISPLAY_NAME[muscle.muscle]}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={cn(
                    "h-full rounded-full",
                    barColor(muscle.recoveryPercent as number),
                  )}
                  style={{ width: `${muscle.recoveryPercent}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs font-bold text-mf-glass-text">
                {muscle.recoveryPercent}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-mf-glass-text-muted">
          Not enough logged training history yet to estimate per-muscle recovery.
        </p>
      )}

      {readiness.limitingFactors.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {readiness.limitingFactors.map((factor) => (
            <span
              key={factor}
              className="rounded-full border border-mf-glass-border bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-mf-glass-text-secondary"
            >
              {factor.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex items-start gap-2 border-t border-mf-glass-border pt-4">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-mf-glass-text-muted" aria-hidden="true" />
        <p className="text-xs leading-5 text-mf-glass-text-muted">
          Estimate only, not a medical or clinically validated measurement.
          Confidence: {Math.round(readiness.confidence * 100)}%. {readiness.method}
        </p>
      </div>
    </article>
  );
}
