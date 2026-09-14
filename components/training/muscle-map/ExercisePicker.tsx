"use client";

import { useRef, useState } from "react";
import { Dumbbell } from "lucide-react";

import { LOCAL_EXERCISE_LIBRARY } from "@/lib/workouts/exercise-library";
import { toExerciseRecord } from "@/lib/workouts/providers/local-provider";
import { searchExerciseRecords } from "@/lib/workouts/search-exercises";
import type { ExerciseRecord } from "@/lib/workouts/providers/types";
import { cn } from "@/lib/cn";

/** Built once at module scope — the same canonical library every other exercise surface (plan builder, library page, ExercisesTab) already reads, never a second hard-coded array. */
const ALL_EXERCISE_RECORDS: ExerciseRecord[] = LOCAL_EXERCISE_LIBRARY.map(toExerciseRecord);

export type ExercisePickerProps = {
  selected: ExerciseRecord | null;
  onSelect: (exercise: ExerciseRecord) => void;
};

/**
 * Exercise Mode's picker — mirrors MuscleSearchBar's combobox shape
 * (debounced local search, arrow/Enter/Escape) but resolves to an
 * ExerciseRecord via the existing `searchExerciseRecords` ranking
 * instead of a canonical muscle, since exercise names aren't a closed
 * vocabulary the same way muscles are.
 */
export function ExercisePicker({ selected, onSelect }: ExercisePickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [results, setResults] = useState<ExerciseRecord[]>([]);

  function handleChange(value: string) {
    setQuery(value);
    setActiveIndex(0);

    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = value.trim();
    if (!trimmed) {
      setResults([]);
      setOpen(false);
      return;
    }

    timerRef.current = setTimeout(() => {
      setResults(searchExerciseRecords(ALL_EXERCISE_RECORDS, { query: trimmed }).slice(0, 8));
      setOpen(true);
    }, 150);
  }

  function pick(record: ExerciseRecord) {
    onSelect(record);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(results[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative flex-1">
      <div className="relative">
        <Dumbbell className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mf-glass-text-muted" />
        <input
          value={query}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder={selected ? selected.canonicalName : "Select exercise…"}
          maxLength={60}
          role="combobox"
          aria-expanded={open}
          aria-controls="exercise-picker-results"
          aria-autocomplete="list"
          className="h-11 w-full rounded-xl border border-mf-glass-border bg-mf-glass-bg-deep pl-9 pr-3 text-sm text-mf-glass-text outline-none placeholder:text-mf-glass-text-muted focus:border-mf-glass-brand-border"
        />
      </div>

      {open && results.length > 0 ? (
        <ul
          id="exercise-picker-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-10 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-mf-glass-border bg-mf-glass-elevated shadow-lg"
        >
          {results.map((record, index) => (
            <li key={record.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pick(record)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                  index === activeIndex
                    ? "bg-mf-glass-brand-soft text-mf-glass-brand"
                    : "text-mf-glass-text-secondary hover:bg-white/5",
                )}
              >
                <span className="truncate">{record.canonicalName}</span>
                <span className="shrink-0 text-[10px] uppercase text-mf-glass-text-muted">{record.equipment[0]}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open && query.trim() && results.length === 0 ? (
        <p className="absolute inset-x-0 top-full mt-1.5 rounded-xl border border-mf-glass-border bg-mf-glass-elevated px-3 py-2 text-xs text-mf-glass-text-muted">
          No exercise matches &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : null}
    </div>
  );
}
