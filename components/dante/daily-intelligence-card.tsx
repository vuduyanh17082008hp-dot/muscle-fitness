"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import type { DailyIntelligence } from "@/lib/dante-core/daily-intelligence";
import { cn } from "@/lib/utils";

/**
 * TODAY card (spec Part B §15) — the exact concept from the spec:
 *
 *   TODAY
 *   Readiness: 78
 *   Training: Push
 *   Nutrition adherence: 91%
 *   Recovery: Good
 *   Dante: "Performance conditions are favorable..."
 *
 * Fetches the cached daily-intelligence snapshot
 * (/api/dante/daily) — recomputed on meaningful events
 * (lib/events/emit.ts), not on every render of this card.
 */

const RECOVERY_STYLES: Record<string, string> = {
  ready: "text-emerald-300",
  good: "text-emerald-300",
  moderate: "text-amber-300",
  priority: "text-rose-300",
};

export function DailyIntelligenceCard() {
  const [intelligence, setIntelligence] = useState<DailyIntelligence | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/dante/daily");
        const data = await response.json();

        if (cancelled) return;

        if (!response.ok || !data.ok) {
          setStatus("error");
          return;
        }

        setIntelligence(data.intelligence as DailyIntelligence);
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

  if (status === "error") {
    return null;
  }

  if (status === "loading" || !intelligence) {
    return (
      <div className="mt-6 rounded-3xl border border-white/10 bg-[#0d0f12] p-6 sm:p-7">
        <p className="text-sm text-zinc-500">Loading today&apos;s summary…</p>
      </div>
    );
  }

  const recoveryStyle = intelligence.recoveryStatus
    ? (RECOVERY_STYLES[intelligence.recoveryStatus] ?? "text-zinc-300")
    : "text-zinc-500";

  return (
    <div className="mt-6 rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-400/[0.06] to-transparent p-6 sm:p-7">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-400">Today</p>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">Readiness</p>
          <p className="mt-1 text-2xl font-black text-white">
            {intelligence.readinessScore ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">Training</p>
          <p className="mt-1 text-2xl font-black text-white">
            {intelligence.trainingFocus ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">Nutrition</p>
          <p className="mt-1 text-2xl font-black text-white">
            {intelligence.nutritionAdherencePercent !== null
              ? `${intelligence.nutritionAdherencePercent}%`
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">Recovery</p>
          <p className={cn("mt-1 text-2xl font-black capitalize", recoveryStyle)}>
            {intelligence.recoveryStatus ?? "—"}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-2 border-t border-white/[0.06] pt-4">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
        <p className="text-sm leading-6 text-zinc-300">
          <span className="font-bold text-amber-400">Dante — </span>
          {intelligence.narrative}
        </p>
      </div>
    </div>
  );
}
