"use client"

import { useEffect, useState } from "react"
import { Beaker, Loader2, Plus, Trash2 } from "lucide-react"

import { DecisionCard } from "@/components/dante/decision-card"
import type { TraceableDecision } from "@/lib/dante-core/types"
import type { ExperimentAnalysis } from "@/lib/experiments/engine"
import type { ExperimentRecord } from "@/lib/experiments/mutations"
import type { ExposureTypeDefinition, OutcomeTypeDefinition } from "@/lib/experiments/catalog"

/**
 * Personal Experiment Lab UI (spec Part "5."). QUESTION -> DEFINE
 * EXPOSURE -> DEFINE OUTCOME happens in the create form below;
 * COLLECT OBSERVATIONS -> COMPARE -> INTERPRET all happen server-side
 * (lib/experiments/) — this component only renders the result through
 * the same DecisionCard every other explainable output in the app
 * uses (Recommendation / Why / Data Used / Confidence / Limitations).
 */

type ExperimentWithResult = {
  experiment: ExperimentRecord;
  result: TraceableDecision<ExperimentAnalysis> | null;
};

type Catalog = { exposureTypes: ExposureTypeDefinition[]; outcomeTypes: OutcomeTypeDefinition[] };

export function ExperimentLab() {
  const [items, setItems] = useState<ExperimentWithResult[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [exposureType, setExposureType] = useState("");
  const [outcomeType, setOutcomeType] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadExperiments() {
    const response = await fetch("/api/experiments");
    const data = await response.json();
    if (data.ok) {
      setItems(data.experiments ?? []);
      setCatalog(data.catalog ?? null);
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        await loadExperiments();
      } finally {
        setLoading(false);
      }
    }

    void init();
  }, []);

  async function handleCreate() {
    if (!question.trim() || !exposureType || !outcomeType) return;

    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), exposureType, outcomeType }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not create this experiment.");
        return;
      }

      setQuestion("");
      setExposureType("");
      setOutcomeType("");
      setShowForm(false);
      await loadExperiments();
    } catch {
      setError("Network error — could not create this experiment.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/experiments/${id}`, { method: "DELETE" });
      setItems((current) => current.filter((item) => item.experiment.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Beaker className="size-4 text-amber-400" aria-hidden="true" />
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-400">
            Personal Experiment Lab
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-zinc-300 hover:bg-white/[0.08]"
        >
          <Plus className="size-3.5" />
          New experiment
        </button>
      </div>

      <p className="text-sm leading-6 text-zinc-500">
        Run your own N-of-1 comparisons — e.g. &ldquo;does late caffeine affect my sleep?&rdquo;
        Every result is an association from your own logged days, never a proven cause, and
        always says so.
      </p>

      {showForm && catalog ? (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Does late caffeine affect my sleep?"
              className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/40"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">
                Exposure
              </label>
              <select
                value={exposureType}
                onChange={(e) => setExposureType(e.target.value)}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
              >
                <option value="">Select…</option>
                {catalog.exposureTypes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
              {exposureType ? (
                <p className="mt-1.5 text-xs leading-5 text-zinc-600">
                  {catalog.exposureTypes.find((e) => e.id === exposureType)?.description}
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">
                Outcome
              </label>
              <select
                value={outcomeType}
                onChange={(e) => setOutcomeType(e.target.value)}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
              >
                <option value="">Select…</option>
                {catalog.outcomeTypes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              {outcomeType ? (
                <p className="mt-1.5 text-xs leading-5 text-zinc-600">
                  {catalog.outcomeTypes.find((o) => o.id === outcomeType)?.description}
                </p>
              ) : null}
            </div>
          </div>

          {error ? <p className="text-xs text-rose-400">{error}</p> : null}

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !question.trim() || !exposureType || !outcomeType}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-amber-400 px-4 text-xs font-black uppercase tracking-[0.06em] text-black hover:bg-amber-300 disabled:opacity-40"
          >
            {creating ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Start tracking
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-zinc-500">
          No experiments yet — start one above to begin comparing your own days.
        </p>
      ) : (
        <div className="space-y-4">
          {items.map(({ experiment, result }) => (
            <div key={experiment.id} className="relative">
              <button
                type="button"
                onClick={() => void handleDelete(experiment.id)}
                disabled={deletingId === experiment.id}
                aria-label={`Delete experiment: ${experiment.question}`}
                className="absolute right-4 top-4 z-10 grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-white/10 hover:text-rose-400 disabled:opacity-40"
              >
                <Trash2 className="size-4" />
              </button>
              {result ? (
                <DecisionCard decision={result} />
              ) : (
                <div className="rounded-3xl border border-white/10 bg-mf-surface p-6 text-sm text-zinc-500">
                  {experiment.question} — couldn&apos;t compute a result.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
