"use client"

import { useEffect, useId, useMemo, useState } from "react"
import { Plus, Minus } from "lucide-react"

import type { NormalizedFood } from "@/lib/nutrition/food-data/types"
import { scaleMacrosToGrams } from "@/lib/nutrition/food-log-calculator"
import { computeFoodIdentity } from "@/lib/nutrition/food-identity"
import { MEAL_TYPES, MEAL_TYPE_LABEL, type MealType, type UserFoodServing } from "@/lib/nutrition/food-log/types"
import type { ConfirmedFood } from "@/components/nutrition/types"

type FoodQuantityConfirmProps = {
  food: NormalizedFood
  mealType: MealType
  onMealTypeChange: (mealType: MealType) => void
  onConfirm: (food: ConfirmedFood) => void
  onBack: () => void
}

type ServingDefinition = { name: string; grams: number }
type Unit = "grams" | "servings"

type LastPortion = {
  quantityGrams: number
  servingName: string | null
  servingsConsumed: number | null
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function FoodQuantityConfirm({
  food,
  mealType,
  onMealTypeChange,
  onConfirm,
  onBack,
}: FoodQuantityConfirmProps) {
  const mealSelectId = useId()

  const foodIdentity = useMemo(
    () => computeFoodIdentity({ barcode: food.barcode, source: food.source, sourceId: food.sourceId }),
    [food.barcode, food.source, food.sourceId],
  )

  const defaultServing: ServingDefinition | null =
    food.servingSizeGrams && food.servingSizeGrams > 0 ? { name: "serving", grams: food.servingSizeGrams } : null

  const [savedServings, setSavedServings] = useState<UserFoodServing[]>([])
  const [lastPortion, setLastPortion] = useState<LastPortion | null>(null)
  // Lazily seeded from foodIdentity's initial value so the "no stable
  // identity" case never needs a synchronous setState inside the effect.
  const [lastPortionResolved, setLastPortionResolved] = useState(() => !foodIdentity)

  const servingOptions: ServingDefinition[] = useMemo(() => {
    const fromPresets = savedServings.map((s) => ({ name: s.servingName, grams: s.servingGrams }))
    return defaultServing ? [defaultServing, ...fromPresets] : fromPresets
  }, [defaultServing, savedServings])

  const [unit, setUnit] = useState<Unit>(defaultServing ? "servings" : "grams")
  const [grams, setGrams] = useState(defaultServing?.grams ?? 100)
  const [servingName, setServingName] = useState(defaultServing?.name ?? "")
  const [servingsCount, setServingsCount] = useState(1)
  const [showLastPortionPrompt, setShowLastPortionPrompt] = useState(false)
  const [showDefineServing, setShowDefineServing] = useState(false)
  const [newServingName, setNewServingName] = useState("")
  const [newServingGrams, setNewServingGrams] = useState("")

  // Load this user's saved serving presets + last-used portion for this exact food.
  useEffect(() => {
    if (!foodIdentity) {
      return
    }

    let cancelled = false

    void fetch(`/api/nutrition/servings?foodIdentity=${encodeURIComponent(foodIdentity)}`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && data.ok) {
          setSavedServings(data.servings ?? [])
        }
      })
      .catch(() => undefined)

    void fetch(`/api/nutrition/last-portion?foodIdentity=${encodeURIComponent(foodIdentity)}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return
        if (data.ok && data.lastPortion) {
          setLastPortion(data.lastPortion)
          setShowLastPortionPrompt(true)
        }
        setLastPortionResolved(true)
      })
      .catch(() => setLastPortionResolved(true))

    return () => {
      cancelled = true
    }
  }, [foodIdentity])

  const selectedServingGrams = servingOptions.find((s) => s.name === servingName)?.grams ?? defaultServing?.grams ?? 0

  const effectiveGrams = unit === "servings" ? round1(servingsCount * selectedServingGrams) : grams
  const scaled = scaleMacrosToGrams(food.per100g, effectiveGrams)

  function adjustGrams(delta: number) {
    setGrams((current) => Math.max(1, Math.round((current + delta) * 10) / 10))
  }

  function buildConfirmedFood(overrideGrams?: number, overrideServing?: { name: string; count: number } | null): ConfirmedFood {
    const finalGrams = overrideGrams ?? effectiveGrams

    return {
      foodName: food.name,
      brand: food.brand,
      source: food.source,
      sourceId: food.sourceId,
      barcode: food.barcode,
      per100g: food.per100g,
      quantityGrams: finalGrams,
      servingName: overrideServing ? overrideServing.name : unit === "servings" ? servingName : null,
      servingsConsumed: overrideServing ? overrideServing.count : unit === "servings" ? servingsCount : null,
      mealType,
      isEstimated: food.isEstimated,
      estimationConfidence: food.isEstimated ? "low" : undefined,
      estimationReason: food.estimationReason,
      estimatedFrom: food.estimatedFrom,
    }
  }

  async function handleDefineServing() {
    const name = newServingName.trim()
    const gramsValue = Number(newServingGrams)

    if (!name || !(gramsValue > 0) || !foodIdentity) return

    try {
      const response = await fetch("/api/nutrition/servings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodIdentity, foodName: food.name, servingName: name, servingGrams: gramsValue }),
      })
      const data = await response.json()

      if (data.ok) {
        setSavedServings((current) => [...current.filter((s) => s.servingName !== name), data.serving])
        setUnit("servings")
        setServingName(name)
        setServingsCount(1)
        setShowDefineServing(false)
        setNewServingName("")
        setNewServingGrams("")
      }
    } catch {
      // Best-effort — the user can still log this food by grams even if saving the preset fails.
    }
  }

  if (!lastPortionResolved) {
    return <div className="py-16 text-center text-sm text-zinc-500">Loading…</div>
  }

  if (showLastPortionPrompt && lastPortion) {
    const previewScaled = scaleMacrosToGrams(food.per100g, lastPortion.quantityGrams)
    const label =
      lastPortion.servingName && lastPortion.servingsConsumed
        ? `${lastPortion.servingsConsumed} ${lastPortion.servingName}${lastPortion.servingsConsumed === 1 ? "" : "s"} (${lastPortion.quantityGrams} g)`
        : `${lastPortion.quantityGrams} g`

    return (
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400">Product found</p>
          <h3 className="mt-1 text-lg font-bold text-white">{food.name}</h3>
          {food.brand ? <p className="text-sm text-zinc-400">{food.brand}</p> : null}
        </div>

        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-400">Last portion</p>
          <p className="mt-1 text-base font-bold text-white">{label}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {previewScaled.calories} kcal · {previewScaled.protein} P / {previewScaled.carbs} C / {previewScaled.fat} F
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setGrams(lastPortion.quantityGrams)
              if (lastPortion.servingName && lastPortion.servingsConsumed) {
                setUnit("servings")
                setServingName(lastPortion.servingName)
                setServingsCount(lastPortion.servingsConsumed)
              }
              setShowLastPortionPrompt(false)
            }}
            className="min-h-12 flex-1 rounded-xl border border-white/10 text-sm font-semibold text-zinc-300 hover:bg-white/5"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm(
                buildConfirmedFood(
                  lastPortion.quantityGrams,
                  lastPortion.servingName && lastPortion.servingsConsumed
                    ? { name: lastPortion.servingName, count: lastPortion.servingsConsumed }
                    : null,
                ),
              )
            }
            className="min-h-12 flex-[2] rounded-xl bg-amber-500 text-sm font-black uppercase tracking-wide text-black hover:bg-amber-400"
          >
            Add Same
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400">Product found</p>
        <h3 className="mt-1 text-lg font-bold text-white">{food.name}</h3>
        {food.brand ? <p className="text-sm text-zinc-400">{food.brand}</p> : null}

        <p className="mt-2 text-xs leading-5 text-zinc-500">
          {food.isEstimated ? (
            <>
              <span className="text-amber-400">Nutrition estimate</span> — {food.estimationReason}
            </>
          ) : (
            <>Nutrition basis: per 100 g ({food.sourceLabel})</>
          )}
          {defaultServing ? ` · ${defaultServing.grams} g = 1 serving` : null}
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">How much did you eat?</p>

        <div className="mb-3 flex gap-2">
          <UnitTab label="Grams" active={unit === "grams"} onClick={() => setUnit("grams")} />
          <UnitTab
            label="Servings"
            active={unit === "servings"}
            onClick={() => {
              setUnit("servings")
              if (!servingName && servingOptions[0]) setServingName(servingOptions[0].name)
            }}
          />
        </div>

        {unit === "grams" ? (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => adjustGrams(-10)}
                className="grid size-11 place-items-center rounded-xl border border-white/10 text-white hover:bg-white/10"
              >
                <Minus className="size-4" />
              </button>

              <input
                type="number"
                inputMode="decimal"
                min={1}
                value={grams}
                onChange={(event) => setGrams(Math.max(1, Number(event.target.value) || 0))}
                className="h-11 w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 text-center text-lg font-bold text-white"
                aria-label="Quantity in grams"
              />

              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => adjustGrams(10)}
                className="grid size-11 place-items-center rounded-xl border border-white/10 text-white hover:bg-white/10"
              >
                <Plus className="size-4" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {[50, 100, 150].map((preset) => (
                <QuickButton key={preset} label={`${preset} g`} active={grams === preset} onClick={() => setGrams(preset)} />
              ))}
            </div>
          </>
        ) : (
          <>
            {servingOptions.length > 1 ? (
              <select
                value={servingName}
                onChange={(event) => setServingName(event.target.value)}
                className="mb-3 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white"
                aria-label="Serving definition"
              >
                {servingOptions.map((option) => (
                  <option key={option.name} value={option.name}>
                    1 {option.name} = {option.grams} g
                  </option>
                ))}
              </select>
            ) : servingOptions.length === 1 ? (
              <p className="mb-3 text-xs text-zinc-500">
                1 {servingOptions[0].name} = {servingOptions[0].grams} g
              </p>
            ) : (
              <p className="mb-3 text-xs text-zinc-500">No serving size known yet — define one below.</p>
            )}

            {servingOptions.length > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Decrease servings"
                    onClick={() => setServingsCount((c) => Math.max(0.5, round1(c - 0.5)))}
                    className="grid size-11 place-items-center rounded-xl border border-white/10 text-white hover:bg-white/10"
                  >
                    <Minus className="size-4" />
                  </button>

                  <input
                    type="number"
                    inputMode="decimal"
                    min={0.5}
                    step={0.5}
                    value={servingsCount}
                    onChange={(event) => setServingsCount(Math.max(0.5, Number(event.target.value) || 0))}
                    className="h-11 w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 text-center text-lg font-bold text-white"
                    aria-label="Number of servings"
                  />

                  <button
                    type="button"
                    aria-label="Increase servings"
                    onClick={() => setServingsCount((c) => round1(c + 0.5))}
                    className="grid size-11 place-items-center rounded-xl border border-white/10 text-white hover:bg-white/10"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>

                <p className="mt-2 text-xs text-zinc-500">= {round1(servingsCount * selectedServingGrams)} g</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {[0.5, 1, 1.5, 2].map((preset) => (
                    <QuickButton
                      key={preset}
                      label={`${preset} serving${preset === 1 ? "" : "s"}`}
                      active={servingsCount === preset}
                      onClick={() => setServingsCount(preset)}
                    />
                  ))}
                </div>
              </>
            ) : null}

            {foodIdentity ? (
              showDefineServing ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-400">Save serving size</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={newServingName}
                      onChange={(event) => setNewServingName(event.target.value)}
                      placeholder="Serving name (e.g. scoop)"
                      className="h-10 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                    />
                    <input
                      inputMode="decimal"
                      value={newServingGrams}
                      onChange={(event) => setNewServingGrams(event.target.value)}
                      placeholder="Grams"
                      className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white sm:w-24"
                    />
                    <button
                      type="button"
                      onClick={handleDefineServing}
                      className="h-10 shrink-0 rounded-lg bg-amber-500 px-4 text-xs font-bold text-black"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDefineServing(true)}
                  className="mt-3 text-xs font-semibold text-amber-400 underline underline-offset-4"
                >
                  Define a new serving size
                </button>
              )
            ) : null}
          </>
        )}
      </div>

      <div>
        <label htmlFor={mealSelectId} className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Meal
        </label>
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
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-amber-400">
          For {effectiveGrams} g
        </p>
        <div className="grid grid-cols-4 gap-2 text-center">
          <MacroPreview label="kcal" value={scaled.calories} />
          <MacroPreview label="P" value={scaled.protein} suffix="g" />
          <MacroPreview label="C" value={scaled.carbs} suffix="g" />
          <MacroPreview label="F" value={scaled.fat} suffix="g" />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-12 flex-1 rounded-xl border border-white/10 text-sm font-semibold text-zinc-300 hover:bg-white/5"
        >
          Back
        </button>

        <button
          type="button"
          disabled={effectiveGrams <= 0}
          onClick={() => onConfirm(buildConfirmedFood())}
          className="min-h-12 flex-[2] rounded-xl bg-amber-500 text-sm font-black uppercase tracking-wide text-black hover:bg-amber-400 disabled:opacity-40"
        >
          Add to Today
        </button>
      </div>
    </div>
  )
}

function UnitTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 flex-1 rounded-lg border text-sm font-semibold transition ${
        active ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-white/10 text-zinc-400 hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  )
}

function QuickButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition ${
        active ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-white/10 text-zinc-400 hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  )
}

function MacroPreview({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div>
      <p className="text-base font-black text-white">
        {value}
        {suffix ? <span className="text-xs font-semibold text-zinc-500">{suffix}</span> : null}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  )
}
