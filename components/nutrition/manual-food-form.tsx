"use client"

import { useId, useState } from "react"

import { MEAL_TYPES, MEAL_TYPE_LABEL, type MealType } from "@/lib/nutrition/food-log/types"
import type { ConfirmedFood } from "@/components/nutrition/types"

type ManualFoodFormProps = {
  mealType: MealType
  onMealTypeChange: (mealType: MealType) => void
  onConfirm: (food: ConfirmedFood) => void
  onClose: () => void
  /** Pre-fills the name — used when a Photo Estimate item has no database match. */
  initialName?: string
}

type FieldState = {
  name: string
  grams: string
  calories: string
  protein: string
  carbs: string
  fat: string
  fiber: string
}

export function ManualFoodForm({ mealType, onMealTypeChange, onConfirm, onClose, initialName }: ManualFoodFormProps) {
  const [fields, setFields] = useState<FieldState>({
    name: initialName ?? "",
    grams: "100",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    fiber: "",
  })
  const [error, setError] = useState<string | null>(null)

  const mealSelectId = useId()

  function update<K extends keyof FieldState>(key: K, value: string) {
    setFields((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const grams = Number(fields.grams)
    const calories = Number(fields.calories)
    const protein = Number(fields.protein)
    const carbs = Number(fields.carbs)
    const fat = Number(fields.fat)
    const fiber = fields.fiber.trim() ? Number(fields.fiber) : null

    if (!fields.name.trim()) {
      setError("Enter a food name.")
      return
    }

    if (!(grams > 0)) {
      setError("Grams must be a positive number.")
      return
    }

    if ([calories, protein, carbs, fat].some((value) => !Number.isFinite(value) || value < 0)) {
      setError("Calories, protein, carbs and fat must be valid numbers.")
      return
    }

    // Convert the entered "at this serving" values back to a per-100g basis
    // so this flows through the exact same deterministic calculator as
    // every other source when it's saved and later edited.
    const factor = 100 / grams

    onConfirm({
      foodName: fields.name.trim(),
      source: "user_provided",
      per100g: {
        calories: calories * factor,
        protein: protein * factor,
        carbs: carbs * factor,
        fat: fat * factor,
        fiber: fiber === null ? null : fiber * factor,
      },
      quantityGrams: grams,
      mealType,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-bold text-white">Manual food entry</h3>
        <p className="mt-1 text-xs text-zinc-500">Enter the nutrition for the amount you&apos;re logging.</p>
      </div>

      <Field label="Food name">
        <input
          value={fields.name}
          onChange={(event) => update("name", event.target.value)}
          className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white"
          placeholder="e.g. Homemade chicken curry"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Serving (g)">
          <input
            inputMode="decimal"
            value={fields.grams}
            onChange={(event) => update("grams", event.target.value)}
            className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white"
          />
        </Field>

        <Field label="Meal">
          <select
            id={mealSelectId}
            value={mealType}
            onChange={(event) => onMealTypeChange(event.target.value as MealType)}
            className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white"
          >
            {MEAL_TYPES.map((meal) => (
              <option key={meal} value={meal}>
                {MEAL_TYPE_LABEL[meal]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Calories (kcal)">
          <input inputMode="decimal" value={fields.calories} onChange={(event) => update("calories", event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white" />
        </Field>
        <Field label="Protein (g)">
          <input inputMode="decimal" value={fields.protein} onChange={(event) => update("protein", event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white" />
        </Field>
        <Field label="Carbs (g)">
          <input inputMode="decimal" value={fields.carbs} onChange={(event) => update("carbs", event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white" />
        </Field>
        <Field label="Fat (g)">
          <input inputMode="decimal" value={fields.fat} onChange={(event) => update("fat", event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white" />
        </Field>
      </div>

      <Field label="Fiber (g) — optional">
        <input inputMode="decimal" value={fields.fiber} onChange={(event) => update("fiber", event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white" />
      </Field>

      {error ? <p className="text-xs font-semibold text-red-400">{error}</p> : null}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 flex-1 rounded-xl border border-white/10 text-sm font-semibold text-zinc-300 hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="min-h-12 flex-[2] rounded-xl bg-amber-500 text-sm font-black uppercase tracking-wide text-black hover:bg-amber-400"
        >
          Add to Today
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</span>
      {children}
    </label>
  )
}
