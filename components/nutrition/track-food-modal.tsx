"use client"

import { useRef, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Barcode, MapPin, Plus, Search, Sparkles, X } from "lucide-react"

import { PrimaryButton } from "@/components/ui/button"
import { suggestMealType } from "@/components/nutrition/meal-type"
import { FoodQuantityConfirm } from "@/components/nutrition/food-quantity-confirm"
import { FoodSearchPanel } from "@/components/nutrition/food-search-panel"
import { BarcodeScanner } from "@/components/nutrition/barcode-scanner"
import { ManualFoodForm } from "@/components/nutrition/manual-food-form"
import { PhotoEstimatePanel } from "@/components/nutrition/photo-estimate-panel"
import { HawkerLensPanel } from "@/components/nutrition/hawkerlens-panel"
import type { ConfirmedFood } from "@/components/nutrition/types"
import type { NormalizedFood } from "@/lib/nutrition/food-data/types"
import type { MealType } from "@/lib/nutrition/food-log/types"
import {
  describeMultiOutcome,
  isCompleteOutcome,
  mergeMultiOutcome,
  type MultiOutcome as FoodLogMultiOutcome,
  type SaveItemResult,
} from "@/lib/nutrition/food-log/client-save"

type Mode = "menu" | "barcode" | "barcode_confirm" | "search" | "photo" | "manual" | "hawkerlens"

type MultiOutcome = FoodLogMultiOutcome<ConfirmedFood>

type TrackFoodModalProps = {
  onAddFood: (food: ConfirmedFood) => Promise<boolean>
  /** One result per input food, in order. */
  onAddFoods: (foods: ConfirmedFood[]) => Promise<SaveItemResult[]>
  /** Something was written outside onAddFood/onAddFoods (HawkerLens) — re-read the day. */
  onLogChanged: () => void
  /** Every dismissal path (X, Escape, overlay, Discard/Done, success) — closing never cancels a write that may have landed. */
  onClosed?: () => void
}

export function TrackFoodModal({ onAddFood, onAddFoods, onLogChanged, onClosed }: TrackFoodModalProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>("menu")
  const [mealType, setMealType] = useState<MealType>(() => suggestMealType())
  const [scannedFood, setScannedFood] = useState<{ food: NormalizedFood; code: string } | null>(null)
  const [manualPrefillName, setManualPrefillName] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const confirmLock = useRef(false)
  const pendingKey = useRef<string | null>(null)
  const [multiOutcome, setMultiOutcome] = useState<MultiOutcome | null>(null)

  function reset() {
    setMode("menu")
    setScannedFood(null)
    setManualPrefillName(undefined)
    setMultiOutcome(null)
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
        <PrimaryButton className="min-h-14 rounded-2xl px-6 text-sm uppercase tracking-wider">
          <Plus className="size-5" />
          Track Food
        </PrimaryButton>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content
          className={[
            "fixed z-50 flex flex-col gap-5 overflow-y-auto bg-mf-glass-surface p-6",
            "inset-x-0 bottom-0 max-h-[90vh] rounded-t-3xl border-t border-mf-glass-border",
            "sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border",
          ].join(" ")}
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-black uppercase tracking-wide text-mf-glass-text">
              Track Food
            </Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Close" className="grid size-9 place-items-center rounded-full text-mf-glass-text-muted hover:bg-white/10 hover:text-mf-glass-text">
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>

          {savedFlash ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <div className="grid size-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">✓</div>
              <p className="text-sm font-bold text-mf-glass-text">Added to Today</p>
            </div>
          ) : saving ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-mf-glass-text-muted">
              Saving…
            </div>
          ) : multiOutcome ? (
            <MultiOutcomePanel
              outcome={multiOutcome}
              onRetryFailed={() =>
                void handleConfirmMultiple([...multiOutcome.unknown, ...multiOutcome.failed].map((item) => item.food))
              }
              onDone={() => handleOpenChange(false)}
            />
          ) : mode === "menu" ? (
            <div className="flex flex-col gap-3">
              <MenuButton icon={Barcode} label="Scan Barcode" onClick={() => setMode("barcode")} />
              <MenuButton icon={Search} label="Search Food" onClick={() => setMode("search")} />
              <MenuButton
                icon={MapPin}
                label="HawkerLens SG — Scan a Hawker Dish"
                onClick={() => setMode("hawkerlens")}
              />
              <MenuButton icon={Sparkles} label="Photo Estimate" onClick={() => setMode("photo")} />
              <MenuButton icon={Plus} label="Manual Entry" onClick={() => setMode("manual")} />
            </div>
          ) : mode === "barcode" ? (
            <BarcodeScanner
              onFound={(food, code) => {
                setScannedFood({ food, code })
                setMode("barcode_confirm")
              }}
              onSwitchToSearch={() => setMode("search")}
              onSwitchToManual={() => setMode("manual")}
              onClose={() => setMode("menu")}
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
              onClose={() => setMode("menu")}
            />
          ) : mode === "photo" ? (
            <PhotoEstimatePanel
              mealType={mealType}
              onMealTypeChange={setMealType}
              onConfirmMultiple={handleConfirmMultiple}
              onSwitchToManual={(name) => {
                setManualPrefillName(name)
                setMode("manual")
              }}
              onClose={() => setMode("menu")}
            />
          ) : mode === "hawkerlens" ? (
            <HawkerLensPanel
              mealType={mealType}
              onMealTypeChange={setMealType}
              onLogChanged={onLogChanged}
              onSaved={flashAndClose}
              onSwitchToPhotoEstimate={() => setMode("photo")}
              onClose={() => setMode("menu")}
            />
          ) : mode === "manual" ? (
            <ManualFoodForm
              mealType={mealType}
              onMealTypeChange={setMealType}
              onConfirm={handleConfirm}
              onClose={() => setMode("menu")}
              initialName={manualPrefillName}
            />
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

function MenuButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Barcode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 items-center gap-4 rounded-2xl border border-mf-glass-border bg-white/[0.03] px-5 text-left transition hover:border-mf-glass-brand-border hover:bg-mf-glass-brand-soft"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand">
        <Icon className="size-5" />
      </span>
      <span className="text-base font-bold text-mf-glass-text">{label}</span>
    </button>
  )
}
