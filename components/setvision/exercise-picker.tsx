"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import {
  CAPABILITY_TEXT,
  CUSTOM_EXERCISE_MAX_LENGTH,
  customSelection,
  findExerciseOption,
  searchExerciseOptions,
  selectionFromOption,
  SOURCE_TEXT,
  validateCustomExerciseName,
  type AnalysisCapability,
  type ExerciseOption,
  type SelectedExercise,
} from "@/lib/setvision/exercise-selection";
import { cn } from "@/lib/utils";

export type PickerMode = "choose" | "custom" | "auto";

const MODES: Array<{ value: PickerMode; label: string }> = [
  { value: "choose", label: "Choose exercise" },
  { value: "custom", label: "Custom exercise" },
  { value: "auto", label: "Auto-detect (Experimental)" },
];

/** Shown before the user types: what SetVision can analyse first, then common lifts it can only label. */
const STARTER_KEYS = [
  "setvision:squat",
  "catalogue:barbell-back-squat",
  "setvision:deadlift",
  "catalogue:barbell-bench-press",
  "catalogue:romanian-deadlift",
  "catalogue:barbell-overhead-press",
];

export function CapabilityBadge({ capability }: { capability: AnalysisCapability }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-bold",
        capability === "SUPPORTED_ANALYSIS" && "border-emerald-400/30 text-emerald-300",
        capability === "LIMITED_EXPERIMENTAL_ANALYSIS" && "border-amber-400/30 text-amber-300",
        capability === "MANUAL_LABEL_ONLY" && "border-white/15 text-zinc-400",
      )}
    >
      {CAPABILITY_TEXT[capability].badge}
    </span>
  );
}

export function ExercisePicker({
  mode,
  onModeChange,
  chosen,
  onChoose,
  custom,
  onCustom,
  customDraft,
  onCustomDraftChange,
}: {
  mode: PickerMode;
  onModeChange: (mode: PickerMode) => void;
  chosen: SelectedExercise | null;
  onChoose: (selection: SelectedExercise | null) => void;
  custom: SelectedExercise | null;
  onCustom: (selection: SelectedExercise | null) => void;
  customDraft: string;
  onCustomDraftChange: (value: string) => void;
}) {
  const ids = useId();
  const [query, setQuery] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLUListElement | null>(null);

  const results: ExerciseOption[] = useMemo(
    () => (query.trim() ? searchExerciseOptions(query) : STARTER_KEYS.map((k) => findExerciseOption(k)!)),
    [query],
  );

  const submitCustom = () => {
    const result = validateCustomExerciseName(customDraft);
    if (!result.ok) {
      setCustomError(result.error);
      onCustom(null);
      return;
    }
    setCustomError(null);
    onCustomDraftChange(result.label);
    onCustom(customSelection(result.label));
  };

  return (
    <div data-testid="sv-exercise-picker">
      <fieldset>
        <legend className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">1. Exercise</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {MODES.map((m) => (
            <label
              key={m.value}
              className={cn(
                "cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold transition focus-within:ring-2 focus-within:ring-amber-400",
                mode === m.value ? "border-amber-400/60 bg-amber-400/10 text-white" : "border-white/10 text-zinc-400 hover:text-white",
              )}
            >
              <input
                type="radio"
                name={`${ids}-mode`}
                value={m.value}
                checked={mode === m.value}
                onChange={() => onModeChange(m.value)}
                className="sr-only"
              />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>

      {mode === "choose" ? (
        <div className="mt-4">
          {chosen ? (
            <SelectedCard selection={chosen} onChange={() => onChoose(null)} />
          ) : (
            <>
              <label htmlFor={`${ids}-search`} className="text-sm font-semibold text-zinc-300">
                Search exercises
              </label>
              <div className="relative mt-1.5 max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                <input
                  id={`${ids}-search`}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      resultsRef.current?.querySelector("button")?.focus();
                    }
                  }}
                  placeholder="e.g. squat, bench press, RDL"
                  aria-describedby={`${ids}-results-status`}
                  autoComplete="off"
                  className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600"
                />
              </div>
              <p id={`${ids}-results-status`} className="sr-only" aria-live="polite">
                {query.trim() ? `${results.length} matching exercise${results.length === 1 ? "" : "s"}` : "Suggested exercises"}
              </p>
              {results.length > 0 ? (
                <ul ref={resultsRef} className="mt-2 max-w-md space-y-1" aria-label="Exercises" data-testid="sv-exercise-results">
                  {results.map((option) => (
                    <li key={option.key}>
                      <button
                        type="button"
                        onClick={() => onChoose(selectionFromOption(option))}
                        onKeyDown={(e) => {
                          const sibling =
                            e.key === "ArrowDown"
                              ? e.currentTarget.parentElement?.nextElementSibling
                              : e.key === "ArrowUp"
                                ? e.currentTarget.parentElement?.previousElementSibling
                                : null;
                          if (sibling) {
                            e.preventDefault();
                            sibling.querySelector("button")?.focus();
                          }
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.07] px-3 py-2 text-left text-sm text-white transition hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                      >
                        <span className="min-w-0 truncate">{option.label}</span>
                        <CapabilityBadge capability={option.capability} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">
                  No exercise matches “{query.trim()}”. Try another name, or use{" "}
                  <button type="button" className="font-semibold text-white underline" onClick={() => { onCustomDraftChange(query.trim()); onModeChange("custom"); }}>
                    Custom exercise
                  </button>
                  .
                </p>
              )}
            </>
          )}
        </div>
      ) : null}

      {mode === "custom" ? (
        <div className="mt-4 max-w-md">
          {custom ? (
            <SelectedCard selection={custom} onChange={() => onCustom(null)} />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitCustom();
              }}
            >
              <label htmlFor={`${ids}-custom`} className="text-sm font-semibold text-zinc-300">
                Enter your exercise name
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id={`${ids}-custom`}
                  value={customDraft}
                  onChange={(e) => {
                    onCustomDraftChange(e.target.value);
                    if (customError) setCustomError(null);
                  }}
                  maxLength={CUSTOM_EXERCISE_MAX_LENGTH * 2}
                  placeholder="e.g. Incline Smith Machine Press"
                  aria-invalid={customError ? true : undefined}
                  aria-describedby={`${ids}-custom-help${customError ? ` ${ids}-custom-error` : ""}`}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600"
                />
                <button type="submit" className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.1]">
                  Use name
                </button>
              </div>
              {customError ? (
                <p id={`${ids}-custom-error`} role="alert" className="mt-1.5 text-sm text-rose-400">
                  {customError}
                </p>
              ) : null}
              <p id={`${ids}-custom-help`} className="mt-1.5 text-xs leading-5 text-zinc-500">
                Up to {CUSTOM_EXERCISE_MAX_LENGTH} characters. Used only on this page — it isn&apos;t added to the
                exercise catalogue, and SetVision has no automated analysis for custom exercises.
              </p>
            </form>
          )}
        </div>
      ) : null}

      {mode === "auto" ? (
        <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400" data-testid="sv-auto-explainer">
          Experimental. After analysing your video, SetVision may <em>suggest</em> squat or deadlift from the pose
          (or a lying press, which it can only label). It often cannot tell — then it says so and you choose.
          Nothing exercise-specific is shown until you confirm a suggestion.
        </p>
      ) : null}
    </div>
  );
}

export function SelectedCard({ selection, onChange }: { selection: SelectedExercise; onChange?: () => void }) {
  return (
    <div className="max-w-2xl rounded-2xl border border-white/10 bg-black/20 p-4" data-testid="sv-selected-exercise">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-base font-black text-white" data-testid="sv-selected-label">
            {selection.label}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">{SOURCE_TEXT[selection.source]}</p>
        </div>
        <div className="flex items-center gap-2">
          <CapabilityBadge capability={selection.capability} />
          {onChange ? (
            <button type="button" onClick={onChange} className="text-xs font-semibold text-zinc-300 underline underline-offset-2 hover:text-white">
              Change
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-400" data-testid="sv-capability-detail">
        {CAPABILITY_TEXT[selection.capability].detail}
      </p>
    </div>
  );
}
