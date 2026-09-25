"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Loader2, Pencil, Trash2, UtensilsCrossed } from "lucide-react"

import { TrackFoodModal } from "@/components/nutrition/track-food-modal"
import { NextMealCard } from "@/components/nutrition/next-meal-card"
import { EmptyState } from "@/components/dashboard/empty-state"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { NutritionResultGlow } from "@/components/nutrition/nutrition-motion"
import type { ConfirmedFood } from "@/components/nutrition/types"
import {
  MEAL_TYPES,
  MEAL_TYPE_LABEL,
  FOOD_LOG_SOURCE_LABEL,
  type FoodLogEntry,
  type DailyMacroTotals,
} from "@/lib/nutrition/food-log/types"
import { computeDailyTotals, compareToTargets, groupByMeal } from "@/lib/nutrition/food-log/totals"
import { addDaysIso, formatDateLabel, todayIso } from "@/lib/nutrition/date-utils"
import { suggestMealType } from "@/components/nutrition/meal-type"
import type { FoodHistoryItem } from "@/lib/nutrition/food-log/history"

type NutritionTrackerProps = {
  initialEntries: FoodLogEntry[]
  target: DailyMacroTotals
  /** The server's own resolved local-today date (profile timezone, not UTC) — the entries above were fetched for THIS date, so the initial view must open on it too, not a possibly-different client-computed "today". */
  initialDate: string
}

export function NutritionTracker({ initialEntries, target, initialDate }: NutritionTrackerProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [entries, setEntries] = useState<FoodLogEntry[]>(initialEntries)
  const [loadingDate, setLoadingDate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [recentFoods, setRecentFoods] = useState<FoodHistoryItem[]>([])
  const [frequentFoods, setFrequentFoods] = useState<FoodHistoryItem[]>([])
  const [nextActionRefreshKey, setNextActionRefreshKey] = useState(0)

  const isToday = selectedDate === todayIso()

  const totals = useMemo(() => computeDailyTotals(entries), [entries])
  const comparison = useMemo(() => compareToTargets(totals, target), [totals, target])
  const grouped = useMemo(() => groupByMeal(entries), [entries])

  const loadRecentFoods = useCallback(() => {
    void fetch("/api/nutrition/recent-foods")
      .then((response) => response.json())
      .then((data) => {
        if (data.ok) {
          setRecentFoods(data.recent ?? [])
          setFrequentFoods(data.frequent ?? [])
        }
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    loadRecentFoods()
  }, [loadRecentFoods])

  useEffect(() => {
    if (selectedDate === todayIso() && entries === initialEntries) {
      return // initial server-rendered data already covers today — skip the redundant fetch.
    }

    let cancelled = false

    const load = async () => {
      setLoadingDate(true)
      setError(null)

      try {
        const response = await fetch(`/api/nutrition/log?date=${selectedDate}`)
        const data = await response.json()

        if (cancelled) return

        if (data.ok) {
          setEntries(data.entries ?? [])
        } else {
          setError(data.error ?? "Unable to load this day's food log.")
        }
      } catch {
        if (!cancelled) setError("Network error — unable to load this day's food log.")
      } finally {
        if (!cancelled) setLoadingDate(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  async function handleAddFood(food: ConfirmedFood): Promise<boolean> {
    setError(null)

    try {
      const response = await fetch("/api/nutrition/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(food),
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Unable to save this food.")
        return false
      }

      setEntries((current) => [...current, data.entry as FoodLogEntry])
      loadRecentFoods()
      setNextActionRefreshKey((key) => key + 1)
      return true
    } catch {
      setError("Network error — unable to save this food.")
      return false
    }
  }

  async function handleAddFoods(foods: ConfirmedFood[]): Promise<boolean> {
    let anySucceeded = false

    for (const food of foods) {
      // Sequential on purpose — food_logs rows don't need a shared
      // transaction, but sequential requests keep this simple and
      // avoid surprising ordering in the saved list.
      const success = await handleAddFood(food)
      anySucceeded = anySucceeded || success
    }

    return anySucceeded
  }

  async function handleAddAgain(item: FoodHistoryItem) {
    setError(null)

    // Derive a per-100g profile back out of exactly what was logged
    // last time (same technique as editing a quantity), then let the
    // one shared calculator rescale it — no re-lookup needed, and the
    // result is byte-for-byte consistent with last time's entry.
    const factor = item.lastQuantityGrams > 0 ? 100 / item.lastQuantityGrams : 0

    await handleAddFood({
      foodName: item.foodName,
      brand: item.brand,
      source: item.source,
      sourceId: item.sourceId,
      barcode: item.barcode,
      per100g: {
        calories: item.lastMacros.calories * factor,
        protein: item.lastMacros.protein * factor,
        carbs: item.lastMacros.carbs * factor,
        fat: item.lastMacros.fat * factor,
        fiber: item.lastMacros.fiber === null ? null : item.lastMacros.fiber * factor,
      },
      quantityGrams: item.lastQuantityGrams,
      servingName: item.lastServingName,
      servingsConsumed: item.lastServingsConsumed,
      mealType: suggestMealType(),
      isEstimated: item.lastIsEstimated,
    })
  }

  async function handleUpdateQuantity(id: string, grams: number) {
    setPendingId(id)
    setError(null)

    try {
      const response = await fetch(`/api/nutrition/log/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantityGrams: grams }),
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Unable to update this food.")
        return
      }

      setEntries((current) => current.map((entry) => (entry.id === id ? (data.entry as FoodLogEntry) : entry)))
      setEditingId(null)
    } catch {
      setError("Network error — unable to update this food.")
    } finally {
      setPendingId(null)
    }
  }

  async function handleDelete(id: string) {
    setPendingId(id)
    setError(null)

    try {
      const response = await fetch(`/api/nutrition/log/${id}`, { method: "DELETE" })
      const data = await response.json()

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Unable to delete this food.")
        return
      }

      setEntries((current) => current.filter((entry) => entry.id !== id))
      setConfirmingDeleteId(null)
      setNextActionRefreshKey((key) => key + 1)
    } catch {
      setError("Network error — unable to delete this food.")
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-mf-glass-brand">
            {isToday ? "Today's Nutrition" : "Food Log"}
          </p>
          <h2 className="mt-1 text-2xl font-black text-mf-glass-text">{formatDateLabel(selectedDate)}</h2>
        </div>

        {isToday ? <TrackFoodModal onAddFood={handleAddFood} onAddFoods={handleAddFoods} /> : null}
      </div>

      <DateNav
        selectedDate={selectedDate}
        onChange={setSelectedDate}
        onPrev={() => setSelectedDate((d) => addDaysIso(d, -1))}
        onNext={() => setSelectedDate((d) => addDaysIso(d, 1))}
      />

      {error ? (
        <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">{error}</p>
      ) : null}

      <NutritionResultGlow>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MacroCard label="Calories" consumed={comparison.calories.consumed} target={comparison.calories.target} remaining={comparison.calories.remaining} unit="kcal" accent />
        <MacroCard label="Protein" consumed={comparison.protein.consumed} target={comparison.protein.target} remaining={comparison.protein.remaining} unit="g" />
        <MacroCard label="Carbs" consumed={comparison.carbs.consumed} target={comparison.carbs.target} remaining={comparison.carbs.remaining} unit="g" />
        <MacroCard label="Fat" consumed={comparison.fat.consumed} target={comparison.fat.target} remaining={comparison.fat.remaining} unit="g" />
      </div>
      </NutritionResultGlow>

      {isToday ? <NextMealCard refreshKey={nextActionRefreshKey} onLogged={handleAddFood} /> : null}

      {isToday && (recentFoods.length > 0 || frequentFoods.length > 0) ? (
        <div id="history" className="grid gap-4 sm:grid-cols-2 scroll-mt-24">
          {recentFoods.length > 0 ? (
            <FoodShortcutList title="Recent Foods" items={recentFoods} onAddAgain={handleAddAgain} />
          ) : null}
          {frequentFoods.length > 0 ? (
            <FoodShortcutList title="Frequent Foods" items={frequentFoods} onAddAgain={handleAddAgain} />
          ) : null}
        </div>
      ) : null}

      <div>
        <p className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-mf-glass-text-muted">Today&apos;s Food</p>

        {loadingDate ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-mf-glass-border bg-white/[0.02] p-6 text-sm text-mf-glass-text-muted">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            glass
            icon={UtensilsCrossed}
            title="Nothing logged yet"
            description={
              isToday
                ? "Track your first meal to start today's nutrition summary."
                : "No food was logged on this day."
            }
          />
        ) : (
          <div className="space-y-6">
            {MEAL_TYPES.filter((meal) => grouped[meal].length > 0).map((meal) => (
              <div key={meal}>
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-mf-glass-text-muted">
                  {MEAL_TYPE_LABEL[meal]}
                </p>
                <ul className="space-y-2">
                  {grouped[meal].map((entry) => (
                    <FoodLogRow
                      key={entry.id}
                      entry={entry}
                      canEdit={isToday}
                      isEditing={editingId === entry.id}
                      isConfirmingDelete={confirmingDeleteId === entry.id}
                      isPending={pendingId === entry.id}
                      onStartEdit={() => setEditingId(entry.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={(grams) => handleUpdateQuantity(entry.id, grams)}
                      onRequestDelete={() => setConfirmingDeleteId(entry.id)}
                      onCancelDelete={() => setConfirmingDeleteId(null)}
                      onConfirmDelete={() => handleDelete(entry.id)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function DateNav({
  selectedDate,
  onChange,
  onPrev,
  onNext,
}: {
  selectedDate: string
  onChange: (date: string) => void
  onPrev: () => void
  onNext: () => void
}) {
  const isToday = selectedDate === todayIso()

  return (
    <div className="flex items-center justify-center gap-3 rounded-xl border border-mf-glass-border bg-white/[0.02] px-4 py-2.5">
      <button type="button" aria-label="Previous day" onClick={onPrev} className="grid size-9 place-items-center rounded-lg text-mf-glass-text-muted hover:bg-white/10 hover:text-mf-glass-text">
        <ChevronLeft className="size-4" />
      </button>

      <input
        type="date"
        value={selectedDate}
        max={todayIso()}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="border-none bg-transparent text-center text-sm font-semibold text-mf-glass-text [color-scheme:dark]"
        aria-label="Select date"
      />

      <button
        type="button"
        aria-label="Next day"
        onClick={onNext}
        disabled={isToday}
        className="grid size-9 place-items-center rounded-lg text-mf-glass-text-muted hover:bg-white/10 hover:text-mf-glass-text disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

function FoodShortcutList({
  title,
  items,
  onAddAgain,
}: {
  title: string
  items: FoodHistoryItem[]
  onAddAgain: (item: FoodHistoryItem) => void
}) {
  return (
    <div className="rounded-2xl border border-mf-glass-border bg-white/[0.02] p-4">
      <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-mf-glass-text-muted">{title}</p>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={`${item.foodIdentity ?? item.foodName}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-mf-glass-bg-deep px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-mf-glass-text">{item.foodName}</p>
              <p className="text-xs text-mf-glass-text-muted">
                {item.lastServingName && item.lastServingsConsumed
                  ? `${item.lastServingsConsumed} ${item.lastServingName}${item.lastServingsConsumed === 1 ? "" : "s"}`
                  : `${item.lastQuantityGrams} g`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onAddAgain(item)}
              className="shrink-0 rounded-lg border border-mf-glass-brand-border bg-mf-glass-brand-soft px-3 py-1.5 text-xs font-bold text-mf-glass-brand hover:bg-mf-glass-brand-soft"
            >
              Add Again
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MacroCard({
  label,
  consumed,
  target,
  remaining,
  unit,
  accent = false,
}: {
  label: string
  consumed: number
  target: number
  remaining: number
  unit: string
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-5 transition duration-200 hover:-translate-y-0.5 hover:border-white/20 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 ${accent ? "border-mf-glass-brand-border bg-mf-glass-brand-soft" : "border-mf-glass-border bg-white/[0.035]"}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mf-glass-text-muted">{label}</p>
      <p className={`mt-3 text-2xl font-black ${accent ? "text-mf-glass-brand" : "text-mf-glass-text"}`}>
        <AnimatedNumber value={consumed} />
        <span className="text-base font-semibold text-mf-glass-text-muted"> / {target} {unit}</span>
      </p>
      <p className="mt-2 text-xs text-mf-glass-text-muted">
        {remaining >= 0 ? `${remaining} ${unit} remaining` : `${Math.abs(remaining)} ${unit} over target`}
      </p>
    </div>
  )
}

function FoodLogRow({
  entry,
  canEdit,
  isEditing,
  isConfirmingDelete,
  isPending,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  entry: FoodLogEntry
  canEdit: boolean
  isEditing: boolean
  isConfirmingDelete: boolean
  isPending: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (grams: number) => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const quantityLabel =
    entry.servingName && entry.servingsConsumed
      ? `${entry.servingsConsumed} ${entry.servingName}${entry.servingsConsumed === 1 ? "" : "s"} (${entry.quantityGrams} g)`
      : `${entry.quantityGrams} g`

  return (
    <li className="rounded-xl border border-mf-glass-border bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-mf-glass-text">
            {entry.foodName}
            {entry.isEstimated ? (
              <span className="ml-2 rounded-full bg-mf-glass-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mf-glass-brand">
                Estimated
              </span>
            ) : null}
          </p>
          <p className="text-xs text-mf-glass-text-muted">
            {quantityLabel} · {FOOD_LOG_SOURCE_LABEL[entry.source]}
          </p>
          <p className="mt-1 text-xs text-mf-glass-text-muted">
            <span className="font-semibold text-mf-glass-text-secondary">{entry.calories} kcal</span>
            {" · "}
            {entry.proteinG} P • {entry.carbsG} C • {entry.fatG} F
          </p>
        </div>

        {canEdit && !isEditing && !isConfirmingDelete ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={`Edit ${entry.foodName}`}
              onClick={onStartEdit}
              disabled={isPending}
              className="grid size-9 place-items-center rounded-lg text-mf-glass-text-muted hover:bg-white/10 hover:text-mf-glass-text disabled:opacity-40"
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              aria-label={`Delete ${entry.foodName}`}
              onClick={onRequestDelete}
              disabled={isPending}
              className="grid size-9 place-items-center rounded-lg text-mf-glass-text-muted hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      {isEditing ? (
        <EditQuantityRow initialGrams={entry.quantityGrams} isPending={isPending} onCancel={onCancelEdit} onSave={onSaveEdit} />
      ) : null}

      {isConfirmingDelete ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-mf-glass-border pt-3">
          <p className="text-xs text-mf-glass-text-muted">Remove {entry.foodName} from today&apos;s food?</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onCancelDelete} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-mf-glass-text-muted hover:bg-white/10">
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={onConfirmDelete}
              className="flex items-center gap-1.5 rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {isPending ? <Loader2 className="size-3 animate-spin" /> : null}
              Remove
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function EditQuantityRow({
  initialGrams,
  isPending,
  onCancel,
  onSave,
}: {
  initialGrams: number
  isPending: boolean
  onCancel: () => void
  onSave: (grams: number) => void
}) {
  const [grams, setGrams] = useState(initialGrams)

  return (
    <div className="mt-3 flex items-center gap-2 border-t border-mf-glass-border pt-3">
      <input
        type="number"
        value={grams}
        onChange={(event) => setGrams(Number(event.target.value) || 0)}
        className="h-10 w-24 rounded-lg border border-mf-glass-border bg-mf-glass-bg-deep px-3 text-center text-sm text-mf-glass-text"
        aria-label="Edit quantity in grams"
      />
      <span className="text-xs text-mf-glass-text-muted">g</span>
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-mf-glass-text-muted hover:bg-white/10">
          Cancel
        </button>
        <button
          type="button"
          disabled={isPending || !(grams > 0)}
          onClick={() => onSave(grams)}
          className="rounded-lg bg-mf-glass-brand px-3 py-1.5 text-xs font-bold text-mf-glass-brand-ink disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  )
}
