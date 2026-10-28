"use client"

import { useRef, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Barcode, Camera, History, MapPin, PencilLine, Plus, ScrollText, Soup, X } from "lucide-react"

import { PrimaryButton } from "@/components/ui/button"
import { suggestMealType } from "@/components/nutrition/meal-type"
import { FoodQuantityConfirm } from "@/components/nutrition/food-quantity-confirm"
import { FoodSearchPanel } from "@/components/nutrition/food-search-panel"
import { BarcodeScanner } from "@/components/nutrition/barcode-scanner"
import { ManualFoodForm } from "@/components/nutrition/manual-food-form"
import { PhotoEstimatePanel, type ReviewSeed } from "@/components/nutrition/photo-estimate-panel"
import { MenuPhotoPanel } from "@/components/nutrition/menu-photo-panel"
import { VietnameseDishPicker } from "@/components/nutrition/vietnamese-dish-picker"
import { HawkerLensPanel } from "@/components/nutrition/hawkerlens-panel"
import type { ConfirmedFood } from "@/components/nutrition/types"
import type { NormalizedFood } from "@/lib/nutrition/food-data/types"
import type { MealType } from "@/lib/nutrition/food-log/types"
import type { FoodHistoryItem } from "@/lib/nutrition/food-log/history"
import {
  describeMultiOutcome,
  isCompleteOutcome,
  mergeMultiOutcome,
  type MultiOutcome as FoodLogMultiOutcome,
  type SaveItemResult,
} from "@/lib/nutrition/food-log/client-save"

type Mode = "barcode" | "barcode_confirm" | "search" | "photo" | "manual" | "hawkerlens" | "dish" | "menu_photo" | "review"

type MultiOutcome = FoodLogMultiOutcome<ConfirmedFood>

type TrackFoodModalProps = {
  onAddFood: (food: ConfirmedFood) => Promise<boolean>
  /** One result per input food, in order. */
  onAddFoods: (foods: ConfirmedFood[]) => Promise<SaveItemResult[]>
  /** Something was written outside onAddFood/onAddFoods (HawkerLens) — re-read the day. */
  onLogChanged: () => void
  /** Every dismissal path (X, Escape, overlay, Discard/Done, success) — closing never cancels a write that may have landed. */
  onClosed?: () => void
  /** Recent/frequent foods offered for one-tap re-logging before anything is searched. */
  quickAdd?: FoodHistoryItem[]
  /** Re-logs a history item at its last portion; resolves true once saved. */
  onAddAgain?: (item: FoodHistoryItem) => Promise<boolean>
}

/** Search is the default; every other source is one tap away underneath it. */
export function TrackFoodModal({ onAddFood, onAddFoods, onLogChanged, onClosed, quickAdd = [], onAddAgain }: TrackFoodModalProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>("search")
  const [mealType, setMealType] = useState<MealType>(() => suggestMealType())
  const [scannedFood, setScannedFood] = useState<{ food: NormalizedFood; code: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const confirmLock = useRef(false)
  const pendingKey = useRef<string | null>(null)
  const [multiOutcome, setMultiOutcome] = useState<MultiOutcome | null>(null)
  /** A dish or menu pick opened in the editable review; it logs only on confirmation, like a photo. */
  const [seed, setSeed] = useState<ReviewSeed | null>(null)

  function reset() {
    setMode("search")
    setScannedFood(null)
    setMultiOutcome(null)
    setSeed(null)
    pendingKey.current = null
    confirmLock.current = false
  }

  function flashAndClose() {
    setSavedFlash(true)
    setTimeout(() => {
      setSavedFlash(false)
      handleOpenChange(false)
    }, 900)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      reset()
      onClosed?.()
    }
  }

  async function handleConfirm(food: ConfirmedFood) {
    if (confirmLock.current) return
    confirmLock.current = true
    pendingKey.current ??= food.idempotencyKey ?? crypto.randomUUID()
    setSaving(true)
    const success = await onAddFood({ ...food, idempotencyKey: pendingKey.current })
    setSaving(false)
    confirmLock.current = false

    if (success) {
      pendingKey.current = null
      flashAndClose()
    }
  }

  async function handleAddAgain(item: FoodHistoryItem) {
    if (!onAddAgain || confirmLock.current) return
    confirmLock.current = true
    setSaving(true)
    const success = await onAddAgain(item)
    setSaving(false)
    confirmLock.current = false
    if (success) flashAndClose()
  }

  const back = () => setMode("search")

  /**
   * Saves each food under its own idempotency key. Keys travel with the food,
   * so a retry resends only failed / unconfirmed items under the SAME keys —
   * a request that actually committed before its response was lost comes back
   * as the existing row instead of a duplicate.
   */
  async function handleConfirmMultiple(foods: ConfirmedFood[]) {
    if (confirmLock.current) return
    confirmLock.current = true
    const keyed = foods.map((food) => ({ ...food, idempotencyKey: food.idempotencyKey ?? crypto.randomUUID() }))
    setSaving(true)
    const results = await onAddFoods(keyed)
    setSaving(false)
    confirmLock.current = false

    const outcome = mergeMultiOutcome(multiOutcome?.saved ?? [], keyed, results)
    if (isCompleteOutcome(outcome)) {
      setMultiOutcome(null)
      flashAndClose()
    } else {
      setMultiOutcome(outcome)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <PrimaryButton className="min-h-12 rounded-2xl px-5 text-sm uppercase tracking-wider">
          <Plus className="size-5" />
          Add food
        </PrimaryButton>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content
          className={[
            "mf-touch-inputs fixed z-50 flex flex-col gap-4 overflow-y-auto overscroll-contain bg-mf-glass-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6",
            // Phones: a fixed tall sheet keeps the search box near the top, above an on-screen keyboard.
            "inset-x-0 bottom-0 h-[92dvh] rounded-t-3xl border-t border-mf-glass-border sm:h-auto",
            "sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border",
          ].join(" ")}
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-black uppercase tracking-wide text-mf-glass-text">
              Add food
            </Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Close" className="grid size-11 place-items-center rounded-full text-mf-glass-text-muted hover:bg-white/10 hover:text-mf-glass-text">
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>

          {savedFlash ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <div className="grid size-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">✓</div>
              <p className="text-sm font-bold text-mf-glass-text">Added to Today</p>
            </div>
          ) : multiOutcome ? (
            <MultiOutcomePanel
              outcome={multiOutcome}
              onRetryFailed={() =>
                void handleConfirmMultiple([...multiOutcome.unknown, ...multiOutcome.failed].map((item) => item.food))
              }
              onDone={() => handleOpenChange(false)}
            />
          ) : mode === "barcode" ? (
            <BarcodeScanner
              onFound={(food, code) => {
                setScannedFood({ food, code })
                setMode("barcode_confirm")
              }}
              onSwitchToSearch={back}
              onSwitchToManual={() => setMode("manual")}
              onClose={back}
            />
          ) : mode === "barcode_confirm" && scannedFood ? (
            <FoodQuantityConfirm
              food={scannedFood.food}
              mealType={mealType}
              onMealTypeChange={setMealType}
              onConfirm={handleConfirm}
              onBack={() => setMode("barcode")}
            />
          ) : mode === "search" ? (
            <FoodSearchPanel
              mealType={mealType}
              onMealTypeChange={setMealType}
              onConfirm={handleConfirm}
              onClose={() => handleOpenChange(false)}
              cancelLabel="Close"
              idleContent={onAddAgain && quickAdd.length > 0 ? <QuickAddList items={quickAdd} onAdd={(item) => void handleAddAgain(item)} /> : undefined}
              moreOptions={<OtherSources onPick={setMode} />}
            />
          ) : mode === "photo" ? (
            <PhotoEstimatePanel
              mealType={mealType}
              onMealTypeChange={setMealType}
              onConfirmMultiple={handleConfirmMultiple}
              onClose={back}
            />
          ) : mode === "review" && seed ? (
            <PhotoEstimatePanel
              key={seed.title}
              seed={seed}
              mealType={mealType}
              onMealTypeChange={setMealType}
              onConfirmMultiple={handleConfirmMultiple}
              onClose={() => {
                setSeed(null)
                back()
              }}
            />
          ) : mode === "dish" ? (
            <VietnameseDishPicker
              onPick={(next) => {
                setSeed(next)
                setMode("review")
              }}
              onClose={back}
            />
          ) : mode === "menu_photo" ? (
            <MenuPhotoPanel
              onReview={(next) => {
                setSeed(next)
                setMode("review")
              }}
              onClose={back}
            />
          ) : mode === "hawkerlens" ? (
            <HawkerLensPanel
              mealType={mealType}
              onMealTypeChange={setMealType}
              onLogChanged={onLogChanged}
              onSaved={flashAndClose}
              onSwitchToPhotoEstimate={() => setMode("photo")}
              onClose={back}
            />
          ) : mode === "manual" ? (
            <ManualFoodForm
              mealType={mealType}
              onMealTypeChange={setMealType}
              onConfirm={handleConfirm}
              onClose={back}
            />
          ) : null}
          {/* QA-04: the active panel stays mounted while saving (an overlay, not a replacement), so a failed or unconfirmed
              save keeps everything the user typed and the same Add button retries under the same idempotency key. */}
          {saving ? (
            <div role="status" aria-live="polite" className="absolute inset-0 z-10 grid place-items-center bg-mf-glass-surface/80 text-sm font-semibold text-mf-glass-text-secondary">
              Saving…
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function MultiOutcomePanel({
  outcome,
  onRetryFailed,
  onDone,
}: {
  outcome: MultiOutcome
  onRetryFailed: () => void
  onDone: () => void
}) {
  const copy = describeMultiOutcome(outcome)
  const retryCount = outcome.failed.length + outcome.unknown.length

  return (
    <div role="alert" className="flex flex-col gap-4">
      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
        <p className="text-sm font-bold text-amber-300">{copy.title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-400">{copy.detail}</p>
      </div>

      <ul className="space-y-2 text-sm">
        {outcome.saved.map((food) => (
          <li key={food.idempotencyKey} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
            <span className="truncate text-white">{food.foodName}</span>
            <span className="shrink-0 text-xs font-bold text-emerald-400">Saved</span>
          </li>
        ))}
        {outcome.failed.map(({ food, error }) => (
          <li key={food.idempotencyKey} className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-white">{food.foodName}</span>
              <span className="shrink-0 text-xs font-bold text-red-400">Not saved</span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">{error}</p>
          </li>
        ))}
        {outcome.unknown.map(({ food, error }) => (
          <li key={food.idempotencyKey} className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-white">{food.foodName}</span>
              <span className="shrink-0 text-xs font-bold text-amber-300">Not confirmed</span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">{error}</p>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onRetryFailed}
        className="min-h-12 rounded-xl bg-amber-500 text-sm font-black uppercase tracking-wide text-black hover:bg-amber-400"
      >
        {outcome.unknown.length > 0 ? `Retry / confirm items (${retryCount})` : `Retry failed items (${retryCount})`}
      </button>
      <button
        type="button"
        onClick={onDone}
        className="min-h-11 rounded-xl border border-white/10 text-sm font-semibold text-zinc-400 hover:bg-white/5"
      >
        {copy.dismissLabel}
      </button>
    </div>
  )
}

const OTHER_SOURCES: Array<{ mode: Mode; icon: typeof Barcode; label: string; hint: string }> = [
  { mode: "barcode", icon: Barcode, label: "Scan barcode", hint: "Packaged food" },
  { mode: "photo", icon: Camera, label: "Food photo", hint: "Estimate you review" },
  { mode: "hawkerlens", icon: MapPin, label: "HawkerLens SG", hint: "Scan a hawker dish" },
  { mode: "dish", icon: Soup, label: "Vietnamese dish", hint: "Phở, bún chả, cơm tấm…" },
  { mode: "menu_photo", icon: ScrollText, label: "Menu photo", hint: "Pick an order — logs nothing" },
  { mode: "manual", icon: PencilLine, label: "Manual entry", hint: "Your own values" },
]

function OtherSources({ onPick }: { onPick: (mode: Mode) => void }) {
  return (
    <section aria-label="Other ways to add food">
      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-mf-glass-text-muted">Other ways to add</p>
      <div className="grid grid-cols-2 gap-2">
        {OTHER_SOURCES.map(({ mode, icon: Icon, label, hint }) => (
          <button
            key={mode}
            type="button"
            onClick={() => onPick(mode)}
            className="flex min-h-14 min-w-0 items-center gap-2.5 rounded-xl border border-mf-glass-border bg-white/[0.03] px-3 py-2 text-left transition hover:border-mf-glass-brand-border hover:bg-mf-glass-brand-soft"
          >
            <Icon className="size-4 shrink-0 text-mf-glass-brand" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-tight text-mf-glass-text">{label}</span>
              <span className="block text-[11px] leading-tight text-mf-glass-text-muted">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function QuickAddList({ items, onAdd }: { items: FoodHistoryItem[]; onAdd: (item: FoodHistoryItem) => void }) {
  return (
    <section aria-label="Recent foods">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-mf-glass-text-muted">
        <History className="size-3.5" aria-hidden="true" /> Recent · same portion as last time
      </p>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={`${item.foodIdentity ?? item.foodName}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] py-1.5 pl-3 pr-1.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-mf-glass-text">{item.foodName}</p>
              <p className="text-xs text-mf-glass-text-muted">
                {item.lastServingName && item.lastServingsConsumed
                  ? `${item.lastServingsConsumed} ${item.lastServingName}${item.lastServingsConsumed === 1 ? "" : "s"}`
                  : `${item.lastQuantityGrams} g`}
                {" · "}
                {Math.round(item.lastMacros.calories)} kcal{item.lastIsEstimated ? " · estimate" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onAdd(item)}
              aria-label={`Add ${item.foodName} again`}
              className="min-h-11 shrink-0 rounded-lg border border-mf-glass-brand-border bg-mf-glass-brand-soft px-3 text-xs font-bold text-mf-glass-brand"
            >
              Add again
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
