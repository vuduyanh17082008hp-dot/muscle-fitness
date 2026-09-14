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
    <article className="rounded-[18px] border border-mf-glass-border bg-mf-glass-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-6 text-mf-glass-text-secondary">{pattern.summary}</p>

        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]",
            pattern.tier === "policy"
              ? "border-mf-glass-dante/30 bg-mf-glass-dante/10 text-mf-glass-dante"
              : "border-mf-glass-border bg-white/[0.04] text-mf-glass-text-muted",
          )}
        >
          {pattern.tier}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-mf-glass-text-muted transition-colors hover:text-mf-glass-text-secondary"
      >
        Evidence
        <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded ? (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-mf-glass-border bg-mf-glass-bg-deep p-3 sm:grid-cols-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">Comparable situations</p>
            <p className="mt-0.5 text-sm font-bold text-mf-glass-text">{pattern.sampleCount}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">Positive outcomes</p>
            <p className="mt-0.5 text-sm font-bold text-mf-glass-text">{pattern.positiveCount}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">Confidence</p>
            <p className="mt-0.5 text-sm font-bold text-mf-glass-text">{confidenceLabel(pattern.confidence)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">Last seen</p>
            <p className="mt-0.5 text-sm font-bold text-mf-glass-text">
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
              ? "bg-mf-glass-brand text-mf-glass-brand-ink hover:bg-mf-glass-brand-hover"
              : "border border-mf-glass-border text-mf-glass-text-muted hover:bg-white/[0.06]",
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
              ? "bg-mf-glass-brand text-mf-glass-brand-ink hover:bg-mf-glass-brand-hover"
              : "border border-mf-glass-border text-mf-glass-text-muted hover:bg-white/[0.06]",
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
    <section className="flex flex-col gap-6 rounded-[24px] border border-mf-glass-border bg-mf-glass-surface p-6 sm:p-8">
      {/* ===================================================
          HEADER — title + a small supporting description that's
          ALWAYS present (not just in the empty state), so the
          section reads clearly on its own before its body loads.
          Natural document flow, no absolute positioning, no fixed
          height: the card's height is driven entirely by content.
      =================================================== */}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-mf-glass-dante/25 bg-mf-glass-dante/10">
              <Brain className="size-3.5 text-mf-glass-dante" aria-hidden="true" />
            </span>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-mf-glass-dante">Dante learned</p>
          </div>

          {patterns && patterns.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-mf-glass-text-muted">
              <span className="size-1.5 rounded-full bg-mf-glass-dante" aria-hidden="true" />
              {patterns.length} active
            </span>
          ) : null}
        </div>

        <p className="max-w-xl text-sm leading-6 text-mf-glass-text-muted">
          Patterns Dante has confirmed from your real training, nutrition and recovery data —
          visible, editable, and always traceable to real evidence.
        </p>
      </div>

      {/* ===================================================
          BODY
      =================================================== */}

      {error ? <p className="text-sm leading-6 text-rose-400">{error}</p> : null}

      {!error && patterns === null ? (
        <p className="text-sm text-mf-glass-text-muted">Loading…</p>
      ) : null}

      {!error && patterns !== null && patterns.length === 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-bold text-mf-glass-text-secondary">Nothing learned yet.</p>
          <p className="max-w-md text-sm leading-6 text-mf-glass-text-muted">
            As you log training, nutrition and recovery, Dante will surface evidence-backed patterns
            here — never a guess from a single data point.
          </p>
        </div>
      ) : null}

      {patterns && patterns.length > 0 ? (
        <div className="flex flex-col gap-3">
          {patterns.map((pattern) => (
            <PatternCard key={pattern.id} pattern={pattern} onAction={handleAction} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
