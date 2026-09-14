"use client";

import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import { MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { resolveMuscleQuery } from "@/lib/training/muscle-search";
import { cn } from "@/lib/cn";

type SearchState = "idle" | "suggestions" | "empty";

export type MuscleSearchBarProps = {
  onResolve: (muscle: CanonicalMuscle) => void;
};

/**
 * Deterministic, local, synchronous search — no network round-trip
 * (resolveMuscleQuery runs entirely client-side over the small known
 * muscle vocabulary), so there's nothing to debounce against a
 * server; the debounce here exists only to avoid recomputing
 * suggestions on every keystroke of a fast typist. Mirrors
 * food-search-panel.tsx's SearchState-union shape; arrow-key/Enter
 * list navigation is new (no existing repo precedent for that part).
 */
export function MuscleSearchBar({ onResolve }: MuscleSearchBarProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [suggestions, setSuggestions] = useState<CanonicalMuscle[]>([]);

  const state: SearchState = useMemo(() => {
    if (!query.trim()) return "idle";
    return suggestions.length > 0 ? "suggestions" : "empty";
  }, [query, suggestions]);

  function handleChange(value: string) {
    setQuery(value);
    setActiveIndex(0);

    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = value.trim();
    if (!trimmed) {
      setSuggestions([]);
      return;
    }

    timerRef.current = setTimeout(() => {
      const resolution = resolveMuscleQuery(trimmed);

      if (resolution.exact) {
        onResolve(resolution.exact);
        setQuery("");
        setSuggestions([]);
        return;
      }

      setSuggestions(resolution.suggestions);
    }, 150);
  }

  function selectSuggestion(muscle: CanonicalMuscle) {
    onResolve(muscle);
    setQuery("");
    setSuggestions([]);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (state !== "suggestions") return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setQuery("");
      setSuggestions([]);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mf-glass-text-muted" />
        <input
          value={query}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search a muscle… (traps, lats, xô, cầu vai)"
          maxLength={60}
          role="combobox"
          aria-expanded={state === "suggestions"}
          aria-controls="muscle-search-suggestions"
          aria-autocomplete="list"
          className="h-11 w-full rounded-xl border border-mf-glass-border bg-mf-glass-bg-deep pl-9 pr-3 text-sm text-mf-glass-text outline-none placeholder:text-mf-glass-text-muted focus:border-mf-glass-brand-border"
        />
      </div>

      {state === "suggestions" ? (
        <ul
          id="muscle-search-suggestions"
          role="listbox"
          className="absolute inset-x-0 top-full z-10 mt-1.5 overflow-hidden rounded-xl border border-mf-glass-border bg-mf-glass-elevated shadow-lg"
        >
          {suggestions.map((muscle, index) => (
            <li key={muscle} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onClick={() => selectSuggestion(muscle)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex w-full items-center px-3 py-2 text-left text-sm transition-colors",
                  index === activeIndex
                    ? "bg-mf-glass-brand-soft text-mf-glass-brand"
                    : "text-mf-glass-text-secondary hover:bg-white/5",
                )}
              >
                {MUSCLE_DISPLAY_NAME[muscle]}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {state === "empty" ? (
        <p className="absolute inset-x-0 top-full mt-1.5 rounded-xl border border-mf-glass-border bg-mf-glass-elevated px-3 py-2 text-xs text-mf-glass-text-muted">
          No muscle matches &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : null}
    </div>
  );
}
