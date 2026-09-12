"use client"

import { useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Barcode, MapPin, Plus, Search, Sparkles, X } from "lucide-react"

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

type Mode = "menu" | "barcode" | "barcode_confirm" | "search" | "photo" | "manual" | "hawkerlens"

type TrackFoodModalProps = {
  onAddFood: (food: ConfirmedFood) => Promise<boolean>
  onAddFoods: (foods: ConfirmedFood[]) => Promise<boolean>
}

export function TrackFoodModal({ onAddFood, onAddFoods }: TrackFoodModalProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>("menu")
  const [mealType, setMealType] = useState<MealType>(() => suggestMealType())
  const [scannedFood, setScannedFood] = useState<{ food: NormalizedFood; code: string } | null>(null)
  const [manualPrefillName, setManualPrefillName] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  function reset() {
    setMode("menu")
    setScannedFood(null)
    setManualPrefillName(undefined)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  async function handleConfirm(food: ConfirmedFood) {
    setSaving(true)
    const success = await onAddFood(food)
    setSaving(false)

    if (success) {
      setSavedFlash(true)
      setTimeout(() => {
        setSavedFlash(false)
        handleOpenChange(false)
      }, 900)
    }
  }

  async function handleConfirmMultiple(foods: ConfirmedFood[]) {
    setSaving(true)
    const success = await onAddFoods(foods)
    setSaving(false)

    if (success) {
      setSavedFlash(true)
      setTimeout(() => {
        setSavedFlash(false)
        handleOpenChange(false)
      }, 900)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-6 text-sm font-black uppercase tracking-wider text-black transition hover:bg-amber-400"
        >
          <Plus className="size-5" />
          Track Food
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content
          className={[
            "fixed z-50 flex flex-col gap-5 overflow-y-auto bg-zinc-950 p-6",
            "inset-x-0 bottom-0 max-h-[90vh] rounded-t-3xl border-t border-white/10",
            "sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border",
          ].join(" ")}
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-black uppercase tracking-wide text-white">
              Track Food
            </Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Close" className="grid size-9 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white">
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>

          {savedFlash ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <div className="grid size-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">✓</div>
              <p className="text-sm font-bold text-white">Added to Today</p>
            </div>
          ) : saving ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-zinc-400">
              Saving…
            </div>
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
              onSaved={() => {
                setSavedFlash(true)
                setTimeout(() => {
                  setSavedFlash(false)
                  handleOpenChange(false)
                }, 900)
              }}
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
      className="flex min-h-16 items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 text-left transition hover:border-amber-400/30 hover:bg-amber-400/5"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
        <Icon className="size-5" />
      </span>
      <span className="text-base font-bold text-white">{label}</span>
    </button>
  )
}
