"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Search } from "lucide-react"

import type { NormalizedFood } from "@/lib/nutrition/food-data/types"
import { FoodQuantityConfirm } from "@/components/nutrition/food-quantity-confirm"
import type { ConfirmedFood } from "@/components/nutrition/types"
import type { MealType } from "@/lib/nutrition/food-log/types"

type SearchState = "idle" | "searching" | "results" | "empty" | "error"

type FoodSearchPanelProps = {
  mealType: MealType
  onMealTypeChange: (mealType: MealType) => void
  onConfirm: (food: ConfirmedFood) => void
  onClose: () => void
}

const DEBOUNCE_MS = 400

export function FoodSearchPanel({ mealType, onMealTypeChange, onConfirm, onClose }: FoodSearchPanelProps) {
  const [query, setQuery] = useState("")
  const [state, setState] = useState<SearchState>("idle")
  const [results, setResults] = useState<NormalizedFood[]>([])
  const [selected, setSelected] = useState<NormalizedFood | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const trimmed = query.trim()

    if (!trimmed) {
      return
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setState("searching")

      try {
        const response = await fetch(`/api/nutrition/foods/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        })
        const data = await response.json()

        if (!response.ok || !data.ok) {
          setState("error")
          return
        }

        const foods: NormalizedFood[] = data.foods ?? []
        setResults(foods)
        setState(foods.length > 0 ? "results" : "empty")
      } catch (error) {
        if ((error as Error).name === "AbortError") return
        setState("error")
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  // Deriving this during render (rather than syncing it via setState in
  // the effect above) means clearing the input never needs an extra
  // render pass just to flip the displayed state back to idle.
  const effectiveState: SearchState = query.trim() ? state : "idle"

  if (selected) {
    return (
      <FoodQuantityConfirm
        food={selected}
        mealType={mealType}
        onMealTypeChange={onMealTypeChange}
        onConfirm={onConfirm}
        onBack={() => setSelected(null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search foods, ingredients or brands"
          maxLength={100}
          className="h-12 w-full rounded-xl border border-white/10 bg-black/30 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600"
          aria-label="Search foods"
        />
      </div>

      {effectiveState === "searching" ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
          <Loader2 className="size-4 animate-spin" />
          Searching…
        </div>
      ) : null}

      {effectiveState === "empty" ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          No matches found. Try a different term, or use Manual Entry.
        </p>
      ) : null}

      {effectiveState === "error" ? (
        <p className="py-8 text-center text-sm text-red-400">
          Food lookup is temporarily unavailable. Try again, or use Manual Entry.
        </p>
      ) : null}

      {effectiveState === "results" ? (
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {results.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => setSelected(food)}
                className="flex w-full flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left hover:border-amber-400/30 hover:bg-amber-400/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">{food.name}</span>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                    {food.sourceLabel}
                  </span>
                </div>
                <p className="text-xs text-zinc-500">
                  {food.preparationState !== "unknown" ? `${food.preparationState} · ` : ""}
                  {Math.round(food.per100g.calories)} kcal / 100g · P {Math.round(food.per100g.protein)} · C{" "}
                  {Math.round(food.per100g.carbs)} · F {Math.round(food.per100g.fat)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {effectiveState === "idle" ? (
        <p className="py-8 text-center text-sm text-zinc-600">
          Start typing to search USDA and Open Food Facts.
        </p>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        className="min-h-11 rounded-xl border border-white/10 text-sm font-semibold text-zinc-400 hover:bg-white/5"
      >
        Cancel
      </button>
    </div>
  )
}
