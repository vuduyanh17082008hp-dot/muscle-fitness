"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import type { DanteProposedAction } from "@/lib/dante-core/actions/types";
import { cn } from "@/lib/cn";

/**
 * Action Preview (spec Part "3. ACTION PREVIEW"). Shows exactly what
 * would change, in plain before → after terms, with the reason Dante
 * is proposing it — never applies anything until the user presses
 * "Apply changes". Every action here, confirmed or dismissed, is
 * logged server-side by /api/dante/actions (see apply-action.ts) —
 * this component never mutates data itself, only calls that route.
 */

type ResolutionState = "idle" | "submitting" | "applied" | "dismissed" | "error";

function DiffLine({ action }: { action: DanteProposedAction }) {
  const { payload } = action;

  switch (payload.type) {
    case "adjust_sets_reps": {
      const before = `${payload.before.sets ?? "—"} × ${payload.before.repMin ?? "—"}-${payload.before.repMax ?? "—"}`;
      const after = `${payload.after.sets ?? "—"} × ${payload.after.repMin ?? "—"}-${payload.after.repMax ?? "—"}`;
      return (
        <p className="text-sm text-zinc-300">
          <span className="font-bold text-white">{payload.exerciseName}</span>{" "}
          <span className="text-zinc-500">{before}</span>{" "}
          <span className="text-amber-400">→</span>{" "}
          <span className="font-bold text-white">{after}</span>
        </p>
      );
    }
    case "modify_volume":
      return (
        <p className="text-sm text-zinc-300">
          <span className="font-bold text-white">{payload.exerciseName}</span>{" "}
          <span className="text-zinc-500">{payload.before.sets} sets</span>{" "}
          <span className="text-amber-400">→</span>{" "}
          <span className="font-bold text-white">{payload.after.sets} sets</span>
        </p>
      );
    case "postpone_exercise":
      return (
        <p className="text-sm text-zinc-300">
          <span className="font-bold text-white">{payload.exerciseName}</span>{" "}
          <span className="font-black uppercase tracking-[0.08em] text-rose-400">Remove today</span>
        </p>
      );
    case "recovery_action":
      return <p className="text-sm text-zinc-300">{payload.suggestion}</p>;
    case "macro_adjustment":
      return (
        <p className="text-sm text-zinc-300">
          <span className="font-bold text-white capitalize">{payload.macro}</span>{" "}
          <span className="text-amber-400 capitalize">{payload.direction}</span>{" "}
          by ~{payload.suggestedChangePercent}%
        </p>
      );
    case "meal_suggestion":
      return (
        <p className="text-sm text-zinc-300">
          {payload.mealDescription}
          {payload.estimatedCalories !== null ? (
            <span className="text-zinc-500"> · ~{payload.estimatedCalories} kcal</span>
          ) : null}
        </p>
      );
  }
}

const ADVISORY_TYPES = new Set(["recovery_action", "macro_adjustment", "meal_suggestion"]);

export function ActionPreview({
  action,
  confidenceFraction,
  onResolved,
}: {
  action: DanteProposedAction;
  /** 0-1. Used only to log alongside the confirm/reject — never recomputed here. */
  confidenceFraction: number;
  onResolved?: (actionId: string, outcome: "applied" | "rejected") => void;
}) {
  const [state, setState] = useState<ResolutionState>("idle");
  const isAdvisory = ADVISORY_TYPES.has(action.payload.type);

  async function resolve(intent: "confirm" | "reject") {
    setState("submitting");

    try {
      const response = await fetch("/api/dante/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: action.payload,
          reason: action.reason,
          confidence: confidenceFraction,
          intent,
        }),
      });

      const result = (await response.json()) as { ok: boolean };

      if (!response.ok || !result.ok) throw new Error("Action failed");

      const outcome = intent === "confirm" ? "applied" : "dismissed";
      setState(outcome);
      onResolved?.(action.id, intent === "confirm" ? "applied" : "rejected");
    } catch {
      setState("error");
    }
  }

  if (state === "applied" || state === "dismissed") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-500">
        <Check className="size-3.5" aria-hidden="true" />
        {state === "applied" ? "Applied." : "Dismissed."}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <DiffLine action={action} />
      <p className="mt-2 text-xs leading-5 text-zinc-500">{action.reason}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void resolve("confirm")}
          disabled={state === "submitting"}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-xl bg-amber-400 px-4 text-xs font-black uppercase tracking-[0.06em] text-black transition-colors duration-200 hover:bg-amber-300 disabled:opacity-50",
          )}
        >
          {state === "submitting" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {isAdvisory ? "Got it" : "Apply changes"}
        </button>

        <button
          type="button"
          onClick={() => void resolve("reject")}
          disabled={state === "submitting"}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-4 text-xs font-bold uppercase tracking-[0.06em] text-zinc-400 transition-colors duration-200 hover:bg-white/[0.06] disabled:opacity-50"
        >
          <X className="size-3.5" aria-hidden="true" />
          {isAdvisory ? "Dismiss" : "Keep original"}
        </button>

        {state === "error" ? (
          <span className="text-xs text-rose-400">Couldn&apos;t save — try again</span>
        ) : null}
      </div>
    </div>
  );
}
