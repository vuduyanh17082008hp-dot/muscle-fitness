"use client"

import { useState } from "react"

import { getLocalFallbackById } from "@/lib/nutrition/food-data/local-fallback"
import { VIETNAMESE_DISHES, dishDefaultTotals, searchVietnameseDishes, templateItems, type VietnameseDish } from "@/lib/nutrition/vietnamese-dishes"
import type { ReviewSeed } from "@/components/nutrition/photo-estimate-panel"

const PORTIONS = [
  { label: "Small", factor: 0.75 },
  { label: "Regular", factor: 1 },
  { label: "Large", factor: 1.3 },
]

/** Pick a curated Vietnamese dish and a portion; its parts open in the editable review. Nothing is logged here. */
export function VietnameseDishPicker({ onPick, onClose }: { onPick: (seed: ReviewSeed) => void; onClose: () => void }) {
  const [query, setQuery] = useState("")
  const [portion, setPortion] = useState(1)
  const dishes = query.trim() ? searchVietnameseDishes(query) : VIETNAMESE_DISHES

  function pick(dish: VietnameseDish) {
    const requiredGrams = dish.components.filter((c) => !c.optional).reduce((sum, c) => sum + c.grams, 0)
    onPick({
      title: `${dish.nameVi} — ${dish.nameEn}`,
      note: dish.notModeled,
      items: templateItems(dish, requiredGrams * portion, "picked"),
      cookingOil: getLocalFallbackById("local-olive-oil"),
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <h3 className="text-lg font-bold text-white">Vietnamese dish</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          A typical recipe split into parts, priced from reference data. Stalls differ, so you&apos;ll check every part before anything is logged.
        </p>
      </div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Phở, bun cha, broken rice…"
        aria-label="Search Vietnamese dishes"
        className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white placeholder:text-zinc-600"
      />
      <div role="radiogroup" aria-label="Portion size" className="grid grid-cols-3 gap-2">
        {PORTIONS.map((option) => (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={portion === option.factor}
            onClick={() => setPortion(option.factor)}
            className={`min-h-10 rounded-lg border text-xs font-bold ${portion === option.factor ? "border-amber-400 bg-amber-400/15 text-amber-300" : "border-white/10 text-zinc-300"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {dishes.length === 0 ? (
        <p className="text-xs text-zinc-500">No curated dish matches. Use Search Food or Manual Entry instead.</p>
      ) : (
        <ul className="space-y-2">
          {dishes.map((dish) => {
            const totals = dishDefaultTotals(dish, portion)
            return (
              <li key={dish.id}>
                <button
                  type="button"
                  onClick={() => pick(dish)}
                  className="flex min-h-14 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:border-amber-400/40"
                >
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-semibold text-white">{dish.nameVi}</span>
                    <span className="block break-words text-xs text-zinc-500">{dish.nameEn}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-zinc-400">
                    ~{totals.calories} kcal
                    <span className="block">{Math.round(totals.protein)} g protein</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-white/10 text-sm font-semibold text-zinc-400 hover:bg-white/5">
        Cancel
      </button>
    </div>
  )
}
