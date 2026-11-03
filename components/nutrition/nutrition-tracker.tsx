"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Pencil, RotateCw, Trash2, UtensilsCrossed } from "lucide-react"

import { TrackFoodModal } from "@/components/nutrition/track-food-modal"
import {
  forgetPendingSaves,
  isStalePending,
  readPendingSaves,
  recheckPendingSaves,
  classifyDayRead,
  saveFoodLogWithReconcile,
  writePendingSaves,
  type SaveItemResult,
} from "@/lib/nutrition/food-log/client-save"
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
import { addDaysIso, formatDateLabel } from "@/lib/nutrition/date-utils"
import { suggestMealType } from "@/components/nutrition/meal-type"
import type { FoodHistoryItem } from "@/lib/nutrition/food-log/history"
import { announceFoodLogChanged, FOOD_LOG_CHANGED_EVENT, foodLogChangeSource } from "@/lib/coach-context-event"

type NutritionTrackerProps = {
  initialEntries: FoodLogEntry[]
  target: DailyMacroTotals
  /** The server's own resolved local-today date (profile timezone, not UTC) — the entries above were fetched for THIS date, so the initial view must open on it too, not a possibly-different client-computed "today". */
  initialDate: string
  /** The server's read of this day failed — totals are unknown, not zero. */
  initialUnavailable?: boolean
  /** Scopes the per-tab pending-save record, so another account in this tab never inherits it. */
  userId: string
}

/**
 * foodName is null for a save restored after a refresh — only its key was kept.
 * notFound: a successful readback, past PENDING_STALE_MS, found no row — the user may dismiss it.
 */
type UnconfirmedSave = { key: string; foodName: string | null; sentAt: number; notFound?: boolean }

export function NutritionTracker({ initialEntries, target, initialDate, initialUnavailable = false, userId }: NutritionTrackerProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [entries, setEntries] = useState<FoodLogEntry[]>(initialEntries)
  // While true, `entries` is not the day's log and must never be summed into totals.
  const [logUnavailable, setLogUnavailable] = useState(initialUnavailable)
  const [reloadKey, setReloadKey] = useState(0)
  const skipInitialFetch = useRef(true)
  const [loadingDate, setLoadingDate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const submittingRef = useRef(false)
  // Writes this tab may have committed (save/edit/delete); a day read started before one is stale.
  const writeCount = useRef(0)
  const [error, setError] = useState<string | null>(null)

  const [recentFoods, setRecentFoods] = useState<FoodHistoryItem[]>([])
  const [frequentFoods, setFrequentFoods] = useState<FoodHistoryItem[]>([])
  const [nextActionRefreshKey, setNextActionRefreshKey] = useState(0)
  // Saves sent today whose commit couldn't be confirmed — totals aren't verified while any remain.
  const [unconfirmed, setUnconfirmed] = useState<UnconfirmedSave[]>([])
  // Not-found saves keep totals unverified too, until the user acknowledges them.
  const totalsUnverified = unconfirmed.length > 0 && selectedDate === initialDate
  const stillUnknown = unconfirmed.filter((item) => !item.notFound)
  const notFound = unconfirmed.filter((item) => item.notFound)

  // QA-03: "today" is the athlete's date (profile timezone) the server resolved, never the device's. A device in another
  // timezone (e.g. Vietnam vs a Singapore profile around midnight) must not hide Add food or relabel the athlete's today.
  const athleteToday = initialDate
  const isToday = selectedDate === athleteToday

  // Every confirmed add/edit/delete (and reload) lands in `entries`; tell the page's other readers of today's log — the
  // Dante nutrition strip re-fetches its server-computed remaining macros — instead of letting them show the old totals.
  const entriesMounted = useRef(false)
  useEffect(() => {
    if (!entriesMounted.current) {
      entriesMounted.current = true
      return
    }
    announceFoodLogChanged("tracker")
  }, [entries])

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
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false
      return // the server already read initialDate (or reported it unavailable) — retry is explicit.
    }

    let cancelled = false
    const startedAtWrite = writeCount.current

    const apply = (read: { ok: true; entries: FoodLogEntry[] } | { ok: false }, failure: string) => {
      const outcome = classifyDayRead(read, startedAtWrite, writeCount.current)
      if (outcome.kind === "stale") {
        setReloadKey((key) => key + 1) // a save/edit/delete landed mid-read: re-read instead of rolling it back
      } else if (outcome.kind === "loaded") {
        setEntries(outcome.entries)
        setLogUnavailable(false)
      } else {
        setEntries([])
        setLogUnavailable(true)
        setError(failure)
      }
    }

    const load = async () => {
      setLoadingDate(true)
      setError(null)

      try {
        const response = await fetch(`/api/nutrition/log?date=${selectedDate}`)
        const data = await response.json()

        if (cancelled) return

        apply(response.ok && data.ok ? { ok: true, entries: data.entries ?? [] } : { ok: false }, data.error ?? "Unable to load this day's food log.")
      } catch {
        if (!cancelled) apply({ ok: false }, "Network error — unable to load this day's food log.")
      } finally {
        if (!cancelled) setLoadingDate(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [selectedDate, reloadKey])

  /** Re-reads the day from the server — the only source of truth after a save we can't fully account for. */
  const reloadLog = useCallback(() => {
    setReloadKey((key) => key + 1)
    setNextActionRefreshKey((key) => key + 1)
    loadRecentFoods()
  }, [loadRecentFoods])

  // Dante (chat or card) confirmed a log: the server row is the truth, so re-read it. Any read already in flight started
  // before that write and is discarded (classifyDayRead). The tracker's own announcements are ignored — no reload loop.
  useEffect(() => {
    const onExternalChange = (event: Event) => {
      if (foodLogChangeSource(event) === "tracker") return
      writeCount.current += 1
      reloadLog()
    }
    window.addEventListener(FOOD_LOG_CHANGED_EVENT, onExternalChange)
    return () => window.removeEventListener(FOOD_LOG_CHANGED_EVENT, onExternalChange)
  }, [reloadLog])

  function forgetPending(keys: Set<string>) {
    setUnconfirmed((current) => current.filter((item) => !keys.has(item.key)))
    forgetPendingSaves(userId, keys)
  }

  async function saveFood(food: ConfirmedFood): Promise<SaveItemResult> {
    const idempotencyKey = food.idempotencyKey ?? crypto.randomUUID()
    const sentAt = Date.now()
    // Recorded BEFORE sending, so a refresh mid-request still re-checks this key on the next load.
    writePendingSaves(userId, [...readPendingSaves(userId).filter((p) => p.key !== idempotencyKey), { key: idempotencyKey, logDate: initialDate, sentAt }])
    const result = await saveFoodLogWithReconcile({ ...food, idempotencyKey })

    if (result.status !== "failed") writeCount.current += 1 // "unknown" may have committed too
    if (result.status === "saved") {
      const entry = result.entry
      // An idempotent replay returns the row that was already saved — never show it twice.
      setEntries((current) => (current.some((e) => e.id === entry.id) ? current : [...current, entry]))
    }
    if (result.status === "unknown") {
      setUnconfirmed((current) =>
        current.some((item) => item.key === idempotencyKey) ? current : [...current, { key: idempotencyKey, foodName: food.foodName, sentAt }],
      )
    } else {
      forgetPending(new Set([idempotencyKey]))
    }
    return result
  }

  /**
   * Read-only re-check of saves whose outcome is unknown. Runs on mount (saves
   * left pending by a refresh), on demand, and when the Track Food modal
   * closes — never on a timer, never re-sends a write. Only a read-back row
   * settles a key; a missing row stays unconfirmed however old it is.
   */
  async function recheckUnconfirmed(pending: UnconfirmedSave[] = unconfirmed) {
    if (pending.length === 0) return
    const { saved, notFound: absent } = await recheckPendingSaves(pending)
    if (saved.size > 0) forgetPending(saved)
    if (absent.size > 0) {
      setUnconfirmed((current) => current.map((item) => (absent.has(item.key) ? { ...item, notFound: true } : item)))
    }
    reloadLog()
  }

  /** User acknowledgement only — the server already read these keys back as absent. Never deletes or adds a food log. */
  function dismissNotFound() {
    forgetPending(new Set(notFound.map((item) => item.key)))
  }

  useEffect(() => {
    const all = readPendingSaves(userId)
    const today = all.filter((p) => p.logDate === initialDate)
    if (today.length !== all.length) writePendingSaves(userId, today) // other days can't be on this view
    if (today.length === 0) return
    const restored = today.map((p) => ({ key: p.key, foodName: null, sentAt: p.sentAt }))
    void Promise.resolve().then(() => {
      setUnconfirmed(restored)
      return recheckUnconfirmed(restored)
    })
    // mount-only: re-entry recovery for saves a refresh/navigation left unresolved
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAddFood(food: ConfirmedFood): Promise<boolean> {
    setError(null)
    const result = await saveFood(food)

    if (result.status !== "saved") {
      setError(result.error)
      if (result.status === "unknown") reloadLog()
      return false
    }

    if (logUnavailable) {
      reloadLog() // the list we hold isn't the whole day — read it back instead of summing a fragment.
    } else {
      loadRecentFoods()
      setNextActionRefreshKey((key) => key + 1)
    }
    return true
  }

  async function handleAddFoods(foods: ConfirmedFood[]): Promise<SaveItemResult[]> {
    setError(null)
    const results: SaveItemResult[] = []

    // Sequential on purpose: one row per item, no shared transaction, so
    // each item gets its own outcome and the modal can retry only failures.
    for (const food of foods) {
      results.push(await saveFood(food))
    }

    // An unknown item may have committed too — re-read rather than trust local entries.
    if (results.some((result) => result.status !== "failed")) reloadLog()
    return results
  }

  async function handleAddAgain(item: FoodHistoryItem): Promise<boolean> {
    if (submittingRef.current) return false
    submittingRef.current = true
    setError(null)

    // Derive a per-100g profile back out of exactly what was logged
    // last time (same technique as editing a quantity), then let the
    // one shared calculator rescale it — no re-lookup needed, and the
    // result is byte-for-byte consistent with last time's entry.
    const factor = item.lastQuantityGrams > 0 ? 100 / item.lastQuantityGrams : 0

    try {
      return await handleAddFood({
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
    } finally {
      submittingRef.current = false
    }
  }

  async function handleUpdateQuantity(id: string, portion: PortionEdit) {
    setPendingId(id)
    setError(null)

    try {
      const response = await fetch(`/api/nutrition/log/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(portion),
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Unable to update this food.")
        return
      }

      writeCount.current += 1
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

      writeCount.current += 1
      setEntries((current) => current.filter((entry) => entry.id !== id))
      setConfirmingDeleteId(null)
      setNextActionRefreshKey((key) => key + 1)
    } catch {
      setError("Network error — unable to delete this food.")
    } finally {
      setPendingId(null)
    }
  }

  // Recent first, then frequent foods not already listed — the Add Food sheet's one-tap re-log list.
  const quickAdd = useMemo(() => {
    const seen = new Set<string>()
    return [...recentFoods, ...frequentFoods]
      .filter((item) => {
        const identity = item.foodIdentity ?? item.foodName
        if (seen.has(identity)) return false
        seen.add(identity)
        return true
      })
      .slice(0, QUICK_ADD_LIMIT)
  }, [recentFoods, frequentFoods])

  return (
    <section className="mf-touch-inputs space-y-5" aria-label="Food log">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-mf-glass-brand">
            {isToday ? "Today's Nutrition" : "Food Log"}
          </p>
          <h2 className="mt-1 text-2xl font-black text-mf-glass-text">{formatDateLabel(selectedDate, athleteToday)}</h2>
        </div>

        {isToday ? (
          <TrackFoodModal
            onAddFood={handleAddFood}
            onAddFoods={handleAddFoods}
            onLogChanged={reloadLog}
            onClosed={() => void recheckUnconfirmed()}
            quickAdd={quickAdd}
            onAddAgain={handleAddAgain}
          />
        ) : null}
      </div>

      <DateNav
        today={athleteToday}
        selectedDate={selectedDate}
        onChange={setSelectedDate}
        onPrev={() => setSelectedDate((d) => addDaysIso(d, -1))}
        onNext={() => setSelectedDate((d) => addDaysIso(d, 1))}
      />

      {error && !logUnavailable ? (
        <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">{error}</p>
      ) : null}

      {logUnavailable && !loadingDate ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            This day&apos;s food log couldn&apos;t be loaded, so consumed and remaining totals are unknown — not zero.
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/30 px-3 text-xs font-bold text-amber-200 hover:bg-amber-400/10"
          >
            <RotateCw className="size-3.5" />
            Retry
          </button>
        </div>
      ) : null}

      {totalsUnverified && !logUnavailable && !loadingDate ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3">
          <div className="space-y-1 text-sm text-amber-200">
            {stillUnknown.length > 0 ? (
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {stillUnknown.length === 1
                    ? `Saving ${stillUnknown[0].foodName ? `"${stillUnknown[0].foodName}"` : "a food"} couldn't be confirmed — it may already be logged.`
                    : `${stillUnknown.length} food saves couldn't be confirmed — they may already be logged.`}{" "}
                  {stillUnknown.some((item) => isStalePending(item.sentAt))
                    ? "Still unconfirmed after 10+ minutes — check today's log before adding it again. "
                    : null}
                </span>
              </p>
            ) : null}
            {notFound.length > 0 ? (
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {notFound.length === 1
                    ? `An earlier save${notFound[0].foodName ? ` of "${notFound[0].foodName}"` : ""} isn't in today's log`
                    : `${notFound.length} earlier food saves aren't in today's log`}
                  {" — the server checked and found no entry. The log below is what was saved; add the food again if it's missing."}
                </span>
              </p>
            ) : null}
            <p>Totals below are unverified until {stillUnknown.length > 0 ? "the server confirms" : "you dismiss this"}.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {stillUnknown.length > 0 ? (
              <button
                type="button"
                onClick={() => void recheckUnconfirmed()}
                className="flex min-h-11 items-center gap-1.5 rounded-lg border border-amber-400/30 px-3 text-xs font-bold text-amber-200 hover:bg-amber-400/10"
              >
                <RotateCw className="size-3.5" />
                Check again
              </button>
            ) : null}
            {notFound.length > 0 ? (
              <button
                type="button"
                onClick={dismissNotFound}
                className="flex min-h-11 items-center rounded-lg border border-amber-400/30 px-3 text-xs font-bold text-amber-200 hover:bg-amber-400/10"
              >
                Dismiss
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <NutritionResultGlow>
        <div className="space-y-2" aria-busy={loadingDate}>
          <MacroCard label="Calories" unavailable={logUnavailable} unverified={totalsUnverified} consumed={comparison.calories.consumed} target={comparison.calories.target} remaining={comparison.calories.remaining} unit="kcal" accent />
          <div className="grid grid-cols-3 gap-2">
            <MacroCard label="Protein" unavailable={logUnavailable} unverified={totalsUnverified} consumed={comparison.protein.consumed} target={comparison.protein.target} remaining={comparison.protein.remaining} unit="g" />
            <MacroCard label="Carbs" unavailable={logUnavailable} unverified={totalsUnverified} consumed={comparison.carbs.consumed} target={comparison.carbs.target} remaining={comparison.carbs.remaining} unit="g" />
            <MacroCard label="Fat" unavailable={logUnavailable} unverified={totalsUnverified} consumed={comparison.fat.consumed} target={comparison.fat.target} remaining={comparison.fat.remaining} unit="g" />
          </div>
        </div>
      </NutritionResultGlow>

      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-mf-glass-text-muted">Meals</p>

        {loadingDate ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-mf-glass-border bg-white/[0.02] p-6 text-sm text-mf-glass-text-muted">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : logUnavailable ? (
          <EmptyState
            glass
            icon={AlertTriangle}
            title="Food log unavailable"
            description="We couldn't read this day's entries. Use Retry above — nothing has been assumed."
          />
        ) : entries.length === 0 ? (
          <EmptyState
            glass
            icon={UtensilsCrossed}
            title="Nothing logged yet"
            description={
              isToday
                ? "Tap Add food to log your first meal."
                : "No food was logged on this day."
            }
          />
        ) : (
          <div className="space-y-5">
            {MEAL_TYPES.filter((meal) => grouped[meal].length > 0).map((meal) => (
              <div key={meal}>
                <p className="mb-2 flex items-baseline justify-between gap-3 border-b-2 border-mf-glass-text pb-1">
                  <span className="font-heading text-xl font-black uppercase tracking-tight text-mf-glass-text">{MEAL_TYPE_LABEL[meal]}</span>
                  <span className="text-sm font-bold tabular-nums text-mf-glass-text-secondary">{Math.round(computeDailyTotals(grouped[meal]).calories)} kcal</span>
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
                      onStartEdit={() => {
                        setConfirmingDeleteId(null)
                        setEditingId(entry.id)
                      }}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={(portion) => handleUpdateQuantity(entry.id, portion)}
                      onRequestDelete={() => {
                        setEditingId(null)
                        setConfirmingDeleteId(entry.id)
                      }}
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

      {isToday ? <NextMealCard refreshKey={nextActionRefreshKey} onLogged={handleAddFood} /> : null}
    </section>
  )
}

const QUICK_ADD_LIMIT = 6

/** What the PATCH route accepts: grams always; a serving pair keeps "2 bowls", omitting it records plain grams. */
type PortionEdit = { quantityGrams: number; servingName?: string; servingsConsumed?: number }

function DateNav({
  today,
  selectedDate,
  onChange,
  onPrev,
  onNext,
}: {
  /** The athlete's date (server-resolved profile timezone). */
  today: string
  selectedDate: string
  onChange: (date: string) => void
  onPrev: () => void
  onNext: () => void
}) {
  const isToday = selectedDate === today

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-mf-glass-border bg-white/[0.02] px-1.5 py-1">
      <button type="button" aria-label="Previous day" onClick={onPrev} className="grid size-11 place-items-center rounded-lg text-mf-glass-text-muted hover:bg-white/10 hover:text-mf-glass-text">
        <ChevronLeft className="size-5" />
      </button>

      <input
        type="date"
        value={selectedDate}
        max={today}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="min-h-11 min-w-0 flex-1 border-none bg-transparent text-center text-sm font-semibold text-mf-glass-text [color-scheme:dark]"
        aria-label="Select date"
      />

      <button
        type="button"
        aria-label="Next day"
        onClick={onNext}
        disabled={isToday}
        className="grid size-11 place-items-center rounded-lg text-mf-glass-text-muted hover:bg-white/10 hover:text-mf-glass-text disabled:opacity-30"
      >
        <ChevronRight className="size-5" />
      </button>
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
  unavailable = false,
  unverified = false,
}: {
  label: string
  consumed: number
  target: number
  remaining: number
  unit: string
  accent?: boolean
  unavailable?: boolean
  /** A save's outcome is unknown, so this figure may be missing it. */
  unverified?: boolean
}) {
  const progress = !unavailable && target > 0 ? Math.min(consumed / target, 1) : 0

  return (
    <div
      className={`min-w-0 rounded-2xl border ${accent ? "border-mf-glass-brand-border bg-mf-glass-brand-soft p-4" : "border-mf-glass-border bg-white/[0.035] p-3"}`}
    >
      <div className={accent ? "flex flex-wrap items-baseline justify-between gap-x-3" : undefined}>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mf-glass-text-muted">{label}</p>
        <p className={`font-black ${accent ? "text-2xl text-mf-glass-brand" : "mt-1 text-lg text-mf-glass-text"}`}>
          {unavailable ? "—" : <AnimatedNumber value={consumed} />}
          <span className={`font-semibold text-mf-glass-text-muted ${accent ? "text-sm" : "text-xs"}`}> / {target}{accent ? ` ${unit}` : unit}</span>
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div className={`h-full rounded-full ${remaining < 0 ? "bg-amber-400" : accent ? "bg-mf-glass-brand" : "bg-mf-glass-text-secondary"}`} style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-mf-glass-text-muted">
        {unavailable
          ? "Unavailable — log not loaded"
          : unverified
            ? "Unverified — a save is unconfirmed"
            : remaining >= 0 ? `${remaining}${accent ? ` ${unit}` : unit} left` : `${Math.abs(remaining)}${accent ? ` ${unit}` : unit} over`}
      </p>
    </div>
  )
}

/** Verified = a USDA / Open Food Facts profile the server re-resolved itself; anything else says where the numbers came from. */
function ProvenanceBadge({ entry }: { entry: FoodLogEntry }) {
  if (entry.isEstimated) {
    return <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-300">Estimate</span>
  }
  if (entry.source === "usda" || entry.source === "open-food-facts") {
    return <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-300">Verified source</span>
  }
  return null
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
  onSaveEdit: (portion: PortionEdit) => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const quantityLabel =
    entry.servingName && entry.servingsConsumed
      ? `${entry.servingsConsumed} ${entry.servingName}${entry.servingsConsumed === 1 ? "" : "s"} (${entry.quantityGrams} g)`
      : `${entry.quantityGrams} g`

  return (
    <li className="rounded-md border border-mf-glass-border bg-mf-glass-surface py-3 pl-4 pr-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-mf-glass-text">
            <span className="min-w-0 break-words">{entry.foodName}</span>
            <ProvenanceBadge entry={entry} />
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mf-glass-text-muted">
            <span>{quantityLabel}</span>
            <span className="rounded border border-mf-glass-border-strong px-1.5 py-px font-semibold text-mf-glass-text-secondary">{FOOD_LOG_SOURCE_LABEL[entry.source]}</span>
          </p>
          <p className="mt-1 text-xs text-mf-glass-text-muted">
            <span className="font-semibold text-mf-glass-text-secondary">{entry.calories} kcal</span>
            {" · "}
            P {entry.proteinG}g · C {entry.carbsG}g · F {entry.fatG}g
          </p>
        </div>

        {canEdit && !isEditing && !isConfirmingDelete ? (
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              aria-label={`Edit portion of ${entry.foodName}`}
              onClick={onStartEdit}
              disabled={isPending}
              className="grid size-11 place-items-center rounded-lg text-mf-glass-text-muted hover:bg-white/10 hover:text-mf-glass-text disabled:opacity-40"
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              aria-label={`Delete ${entry.foodName}`}
              onClick={onRequestDelete}
              disabled={isPending}
              className="grid size-11 place-items-center rounded-lg text-mf-glass-text-muted hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      {isEditing ? (
        <EditPortionRow entry={entry} isPending={isPending} onCancel={onCancelEdit} onSave={onSaveEdit} />
      ) : null}

      {isConfirmingDelete ? (
        <div role="alertdialog" aria-label={`Remove ${entry.foodName}?`} className="mt-3 mr-2 space-y-3 border-t border-mf-glass-border pt-3">
          <p className="text-sm text-mf-glass-text-secondary">
            Remove {entry.foodName} ({entry.calories} kcal) from today? Totals update right away.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onCancelDelete} className="min-h-11 rounded-lg border border-mf-glass-border text-sm font-semibold text-mf-glass-text-secondary hover:bg-white/10">
              Keep
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={onConfirmDelete}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-red-500/90 text-sm font-bold text-[#ffffff] disabled:opacity-40"
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {isPending ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

/**
 * Edits the portion only — the food itself never changes here (delete + re-add for that). An entry logged in servings
 * can be edited in servings, keeping its serving name; the server recomputes every macro from the new grams.
 */
function EditPortionRow({
  entry,
  isPending,
  onCancel,
  onSave,
}: {
  entry: FoodLogEntry
  isPending: boolean
  onCancel: () => void
  onSave: (portion: PortionEdit) => void
}) {
  const serving = entry.servingName && entry.servingsConsumed ? { name: entry.servingName, grams: entry.quantityGrams / entry.servingsConsumed } : null
  const [unit, setUnit] = useState<"servings" | "grams">(serving ? "servings" : "grams")
  const [value, setValue] = useState(String(serving ? entry.servingsConsumed : entry.quantityGrams))

  const amount = Number(value)
  const valid = Number.isFinite(amount) && amount > 0
  const grams = unit === "servings" && serving ? Math.round(amount * serving.grams * 10) / 10 : amount
  // Display-only preview, scaled from this row's stored values; the saved figures come back from the server.
  const preview = valid && entry.quantityGrams > 0 ? Math.round((entry.calories * grams) / entry.quantityGrams) : null

  return (
    <div className="mt-3 mr-2 space-y-3 border-t border-mf-glass-border pt-3">
      {serving ? (
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-mf-glass-border p-1" role="group" aria-label="Portion unit">
          {(["servings", "grams"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={unit === option}
              onClick={() => {
                if (option === unit) return
                setUnit(option)
                setValue(String(option === "grams" ? grams || entry.quantityGrams : Math.round((amount / serving.grams) * 10) / 10 || entry.servingsConsumed))
              }}
              className={`min-h-10 rounded-md text-sm font-semibold capitalize ${unit === option ? "bg-white/10 text-mf-glass-text" : "text-mf-glass-text-muted"}`}
            >
              {option === "servings" ? `${serving.name}s` : "Grams"}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={unit === "servings" ? "0.5" : "1"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 w-28 rounded-lg border border-mf-glass-border bg-mf-glass-bg-deep px-3 text-center text-sm text-mf-glass-text"
          aria-label={unit === "servings" && serving ? `Number of ${serving.name}s` : "Quantity in grams"}
        />
        <span className="text-sm text-mf-glass-text-muted">
          {unit === "servings" && serving ? `${serving.name}${amount === 1 ? "" : "s"} · ${valid ? grams : "—"} g` : "g"}
        </span>
        <span className="ml-auto text-xs text-mf-glass-text-muted" aria-live="polite">
          {preview !== null ? `≈ ${preview} kcal` : null}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-mf-glass-border text-sm font-semibold text-mf-glass-text-secondary hover:bg-white/10">
          Cancel
        </button>
        <button
          type="button"
          disabled={isPending || !valid || !(grams > 0) || grams > 5000}
          onClick={() =>
            onSave(unit === "servings" && serving ? { quantityGrams: grams, servingName: serving.name, servingsConsumed: amount } : { quantityGrams: grams })
          }
          className="min-h-11 rounded-lg bg-mf-glass-brand text-sm font-bold text-mf-glass-brand-ink disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save portion"}
        </button>
      </div>
    </div>
  )
}
