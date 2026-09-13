"use client";

import { useEffect, useState } from "react";
import { Brain, ChevronDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * "DANTE LEARNED" memory control surface (mission Part 14). Every
 * pattern shown here is a real dante_learned_patterns row — visible,
 * editable (ASK FIRST), deletable (FORGET), and auditable (EVIDENCE),
 * exactly as required. No pattern is ever invented client-side; an
 * empty list renders an honest empty state, not a placeholder pattern.
 */

type LearnedPattern = {
  id: string;
  contextKey: string;
  interventionType: string;
  tier: "pattern" | "policy";
  status: "active" | "retained" | "demoted" | "forgotten";
  sampleCount: number;
  positiveCount: number;
  confidence: number;
  summary: string;
  requiresConfirmation: boolean;
  lastReinforcedAt: string;
};

type PatternsResponse = { ok: boolean; patterns?: LearnedPattern[]; error?: string };

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.75) return "High";
  if (confidence >= 0.45) return "Moderate";
  return "Low";
}

function PatternCard({
  pattern,
  onAction,
}: {
  pattern: LearnedPattern;
  onAction: (id: string, action: "keep" | "ask_first" | "forget") => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<"keep" | "ask_first" | "forget" | null>(null);

  async function handle(action: "keep" | "ask_first" | "forget") {
    setPending(action);
    await onAction(pattern.id, action);
    setPending(null);
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-mf-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-6 text-zinc-200">{pattern.summary}</p>

        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]",
            pattern.tier === "policy"
              ? "border-[var(--mf-violet)]/30 bg-[var(--mf-violet)]/10 text-[var(--mf-violet)]"
              : "border-white/10 bg-white/[0.04] text-zinc-500",
          )}
        >
          {pattern.tier}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-300"
      >
        Evidence
        <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded ? (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-white/[0.07] bg-black/20 p-3 sm:grid-cols-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-600">Comparable situations</p>
            <p className="mt-0.5 text-sm font-bold text-white">{pattern.sampleCount}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-600">Positive outcomes</p>
            <p className="mt-0.5 text-sm font-bold text-white">{pattern.positiveCount}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-600">Confidence</p>
            <p className="mt-0.5 text-sm font-bold text-white">{confidenceLabel(pattern.confidence)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-600">Last seen</p>
            <p className="mt-0.5 text-sm font-bold text-white">
              {new Date(pattern.lastReinforcedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handle("keep")}
          disabled={pending !== null}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-black uppercase tracking-[0.06em] transition disabled:opacity-50",
            !pattern.requiresConfirmation
              ? "bg-amber-400 text-black hover:bg-amber-300"
              : "border border-white/10 text-zinc-400 hover:bg-white/[0.06]",
          )}
        >
          {pending === "keep" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Keep
        </button>

        <button
          type="button"
          onClick={() => void handle("ask_first")}
          disabled={pending !== null}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-black uppercase tracking-[0.06em] transition disabled:opacity-50",
            pattern.requiresConfirmation
              ? "bg-amber-400 text-black hover:bg-amber-300"
              : "border border-white/10 text-zinc-400 hover:bg-white/[0.06]",
          )}
        >
          {pending === "ask_first" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Ask First
        </button>

        <button
          type="button"
          onClick={() => void handle("forget")}
          disabled={pending !== null}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-400/20 px-4 text-xs font-black uppercase tracking-[0.06em] text-rose-300 transition hover:bg-rose-400/10 disabled:opacity-50"
        >
          {pending === "forget" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Forget
        </button>
      </div>
    </article>
  );
}

async function fetchPatterns(): Promise<PatternsResponse> {
  try {
    const response = await fetch("/api/dante/memory/patterns");
    return (await response.json()) as PatternsResponse;
  } catch {
    return { ok: false, error: "Unable to load what Dante has learned." };
  }
}

export function DanteLearnedPanel() {
  const [patterns, setPatterns] = useState<LearnedPattern[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchPatterns().then((data) => {
      if (cancelled) return;

      if (!data.ok || !data.patterns) {
        setError(data.error ?? "Unable to load what Dante has learned.");
        return;
      }

      setPatterns(data.patterns);
      setError(null);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    const data = await fetchPatterns();

    if (!data.ok || !data.patterns) {
      setError(data.error ?? "Unable to load what Dante has learned.");
      return;
    }

    setPatterns(data.patterns);
    setError(null);
  }

  async function handleAction(id: string, action: "keep" | "ask_first" | "forget") {
    const response = await fetch("/api/dante/memory/patterns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patternId: id, action }),
    });

    const data = (await response.json()) as { ok: boolean };
    if (data.ok) {
      await refresh();
    }
  }

  return (
    <section className="rounded-[20px] border border-white/10 bg-mf-surface p-6 sm:p-7">
      <div className="flex items-center gap-2">
        <Brain className="size-4 text-[var(--mf-violet)]" aria-hidden="true" />
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--mf-violet)]">Dante learned</p>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-400">{error}</p> : null}

      {!error && patterns === null ? (
        <p className="mt-4 text-sm text-zinc-500">Loading…</p>
      ) : null}

      {!error && patterns !== null && patterns.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-zinc-500">
          Nothing learned yet. As you log training, nutrition and recovery, Dante will surface real,
          evidenced patterns here — never a guess from a single data point.
        </p>
      ) : null}

      {patterns && patterns.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3">
          {patterns.map((pattern) => (
            <PatternCard key={pattern.id} pattern={pattern} onAction={handleAction} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
