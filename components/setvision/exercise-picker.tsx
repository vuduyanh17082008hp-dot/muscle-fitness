"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { Search, Sparkles, PenLine } from "lucide-react";

import { getExerciseConfig } from "@/lib/setvision/exercise-config";
import {
  CAPABILITY_TEXT,
  CATEGORY_ORDER,
  customSelection,
  EXERCISE_OPTIONS,
  referenceFor,
  searchExerciseOptions,
  selectionFromOption,
  SOURCE_TEXT,
  validateCustomExerciseName,
  type AnalysisCapability,
  type ExerciseOption,
  type SelectedExercise,
} from "@/lib/setvision/exercise-selection";
import { cn } from "@/lib/utils";

export function CapabilityBadge({ capability }: { capability: AnalysisCapability }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-bold",
        capability === "ANALYSIS_VERIFIED" && "border-emerald-400/30 text-emerald-300",
        capability === "ANALYSIS_EXPERIMENTAL" && "border-amber-400/30 text-amber-300",
        capability === "MANUAL_REVIEW_SUPPORTED" && "border-white/15 text-zinc-400",
      )}
    >
      {CAPABILITY_TEXT[capability].badge}
    </span>
  );
}

type Item =
  | { kind: "auto"; id: string }
  | { kind: "custom"; id: string; label: string }
  | { kind: "option"; id: string; option: ExerciseOption };

const SEARCH_LIMIT = 30;

/**
 * ONE searchable exercise combobox (ARIA 1.2 combobox + listbox pattern):
 * every catalogue and SetVision exercise grouped by category, Auto-detect,
 * and "use what I typed" as a custom exercise. Focus stays in the input;
 * ↑/↓ move the active option, Enter picks it, Escape closes the list.
 */
export function ExercisePicker({
  selection,
  autoDetect,
  onSelect,
  onAutoDetect,
  selectedDetail,
}: {
  selection: SelectedExercise | null;
  autoDetect: boolean;
  onSelect: (selection: SelectedExercise) => void;
  /** Omit to hide the Auto-detect option (e.g. live Form Coach, which never guesses the exercise). */
  onAutoDetect?: () => void;
  /** Replaces the upload-analysis capability text on the selected card (e.g. live capability). */
  selectedDetail?: (selection: SelectedExercise) => ReactNode;
}) {
  const ids = useId();
  const [open, setOpen] = useState(!selection && !autoDetect);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [group, setGroup] = useState<(typeof CATEGORY_ORDER)[number] | null>(null);

  const custom = validateCustomExerciseName(query);
  const groups = useMemo(() => {
    const options = query.trim() ? searchExerciseOptions(query, SEARCH_LIMIT) : EXERCISE_OPTIONS;
    return query.trim()
      ? [{ heading: options.length ? "Matching exercises" : null, options }]
      : (group ? [group] : CATEGORY_ORDER).map((heading) => ({ heading, options: options.filter((o) => o.category === heading) }));
  }, [query, group]);

  const items: Item[] = useMemo(
    () => [
      ...(query.trim() && custom.ok ? [{ kind: "custom" as const, id: `${ids}-custom`, label: custom.label }] : []),
      ...(onAutoDetect ? [{ kind: "auto" as const, id: `${ids}-auto` }] : []),
      ...groups.flatMap((g) => g.options.map((option) => ({ kind: "option" as const, id: `${ids}-${option.key}`, option }))),
    ],
    [groups, query, custom, ids, onAutoDetect],
  );
  const activeIndex = Math.min(active, items.length - 1);

  const choose = (item: Item) => {
    if (item.kind === "auto") onAutoDetect?.();
    else if (item.kind === "custom") onSelect(customSelection(item.label));
    else onSelect(selectionFromOption(item.option));
    setOpen(false);
    setQuery("");
    setActive(0);
  };

  if (!open && (selection || autoDetect)) {
    return (
      <div data-testid="sv-exercise-picker">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">1. Exercise</p>
        <div className="mt-3">
          {selection ? (
            <SelectedCard selection={selection} onChange={() => setOpen(true)} detail={selectedDetail?.(selection)} />
          ) : (
            <div className="max-w-2xl rounded-2xl border border-white/10 bg-black/20 p-4" data-testid="sv-auto-selected">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-base font-black text-white">Auto-detect (Experimental)</p>
                <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-zinc-300 underline underline-offset-2 hover:text-white">
                  Change
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-400" data-testid="sv-auto-explainer">
                After analysing your video SetVision may <em>suggest</em> an exercise from the pose, or list the few it
                can&apos;t tell apart. It often can&apos;t tell — then it says so and you choose. Nothing exercise-specific
                is shown until you confirm.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const optionClass = (index: number) =>
    cn(
      "flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm text-white",
      index === activeIndex ? "border-amber-400/60 bg-amber-400/10" : "border-white/[0.07] hover:border-white/20",
    );
  const indexOf = new Map(items.map((item, i) => [item.id, i]));

  return (
    <div data-testid="sv-exercise-picker">
      <label htmlFor={`${ids}-input`} className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
        1. Exercise
      </label>
      <div className="relative mt-3 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
        <input
          id={`${ids}-input`}
          role="combobox"
          aria-expanded="true"
          aria-controls={`${ids}-list`}
          aria-autocomplete="list"
          aria-activedescendant={items[activeIndex]?.id}
          aria-describedby={`${ids}-status`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(items.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (items[activeIndex]) choose(items[activeIndex]);
            } else if (e.key === "Escape" && (selection || autoDetect)) {
              e.preventDefault();
              setOpen(false);
            }
          }}
          // Reopened from "Change": that button is gone, so focus moves here (not on first page load).
          autoFocus={Boolean(selection || autoDetect)}
          placeholder="Search exercises, e.g. bench, pulldown, curl"
          autoComplete="off"
          className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600"
          data-testid="sv-exercise-search"
        />
      </div>
      <div className="mt-2 flex max-w-xl flex-wrap gap-1.5" role="group" aria-label="Filter by muscle group" data-testid="sv-group-filters">
        {[null, ...CATEGORY_ORDER].map((g) => (
          <button
            key={g ?? "all"}
            type="button"
            aria-pressed={group === g}
            onClick={() => {
              setGroup(g);
              setActive(0);
            }}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-bold",
              group === g ? "border-amber-400/60 bg-amber-400/10 text-amber-200" : "border-white/10 text-zinc-400 hover:text-white",
            )}
          >
            {g ?? "All"}
          </button>
        ))}
      </div>
      <p id={`${ids}-status`} className="sr-only" aria-live="polite">
        {query.trim() ? `${items.length - 1} result${items.length === 2 ? "" : "s"}` : `${EXERCISE_OPTIONS.length} exercises by category`}
      </p>
      {query.trim() && !custom.ok ? <p className="mt-1.5 text-xs text-rose-400">{custom.error}</p> : null}

      <div
        id={`${ids}-list`}
        role="listbox"
        aria-label="Exercises"
        className="mt-2 max-h-64 max-w-xl space-y-1 overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.06] bg-black/20 p-2"
        data-testid="sv-exercise-results"
      >
        {items.map((item) => {
          if (item.kind === "option") return null;
          const i = indexOf.get(item.id)!;
          return (
            <div
              key={item.id}
              id={item.id}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(item)}
              className={optionClass(i)}
              data-testid={item.kind === "auto" ? "sv-option-auto" : "sv-option-custom"}
            >
              <span className="flex min-w-0 items-center gap-2">
                {item.kind === "auto" ? <Sparkles className="size-4 shrink-0 text-amber-300" aria-hidden="true" /> : <PenLine className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />}
                <span className="min-w-0 break-words">
                  {item.kind === "auto" ? "Auto-detect (Experimental)" : <>Use “{item.label}” as a custom exercise</>}
                </span>
              </span>
              {item.kind === "custom" ? <CapabilityBadge capability="MANUAL_REVIEW_SUPPORTED" /> : null}
            </div>
          );
        })}
        {groups.map((group, g) =>
          group.options.length === 0 ? null : (
            <div key={group.heading ?? g} role="group" aria-labelledby={`${ids}-g${g}`}>
              <p id={`${ids}-g${g}`} className="px-1 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                {group.heading}
              </p>
              <div className="space-y-1">
                {group.options.map((option) => {
                  const i = indexOf.get(`${ids}-${option.key}`)!;
                  return (
                    <div
                      key={option.key}
                      id={`${ids}-${option.key}`}
                      role="option"
                      aria-selected={i === activeIndex}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose({ kind: "option", id: option.key, option })}
                      className={optionClass(i)}
                    >
                      <span className="min-w-0 truncate">{option.label}</span>
                      <CapabilityBadge capability={option.capability} />
                    </div>
                  );
                })}
              </div>
            </div>
          ),
        )}
        {query.trim() && groups[0].options.length === 0 ? (
          <p className="px-1 py-2 text-sm text-zinc-500">No catalogue exercise matches “{query.trim()}”.</p>
        ) : null}
      </div>
    </div>
  );
}

export function SelectedCard({
  selection,
  onChange,
  detail,
}: {
  selection: SelectedExercise;
  onChange?: () => void;
  detail?: ReactNode;
}) {
  const config = selection.engine ? getExerciseConfig(selection.engine) : null;
  const reference = referenceFor(selection.key);
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
          {detail === undefined ? <CapabilityBadge capability={selection.capability} /> : null}
          {onChange ? (
            <button type="button" onClick={onChange} className="text-xs font-semibold text-zinc-300 underline underline-offset-2 hover:text-white" data-testid="sv-change-exercise">
              Change
            </button>
          ) : null}
        </div>
      </div>
      {detail !== undefined ? (
        detail
      ) : (
        <>
          <p className="mt-2 text-xs leading-5 text-zinc-400" data-testid="sv-capability-detail">
            {CAPABILITY_TEXT[selection.capability].detail}
            {selection.manualReason ? ` Why no rep tracking: ${selection.manualReason}` : ""}
          </p>
          {config ? (
            <p className="mt-1 text-xs leading-5 text-zinc-500" data-testid="sv-engine-criterion">
              Measured as a {config.family.toLowerCase()} with the {config.signalLabel}. A rep counts when: {config.criterion} {config.views}
            </p>
          ) : null}
        </>
      )}
      {reference ? (
        <a href={reference.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-semibold text-zinc-200 underline underline-offset-2 hover:text-white" data-testid="sv-reference-link">
          How to do it: {reference.source} ↗
        </a>
      ) : (
        <p className="mt-2 text-xs text-zinc-500" data-testid="sv-reference-none">No verified technique reference for this exact exercise yet.</p>
      )}
    </div>
  );
}
