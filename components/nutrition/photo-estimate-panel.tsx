"use client"

import { useId, useRef, useState } from "react"
import { Camera, Loader2, Upload } from "lucide-react"

import { scaleMacrosToGrams } from "@/lib/nutrition/food-log-calculator"
import { MEAL_TYPES, MEAL_TYPE_LABEL, type MealType } from "@/lib/nutrition/food-log/types"
import type { ConfirmedFood } from "@/components/nutrition/types"

type DetectedItem = {
  detectedName: string
  estimatedGrams: number
  detectionConfidence: "high" | "medium" | "low"
  notes?: string
  groundedFood: {
    name: string
    source: ConfirmedFood["source"]
    sourceId?: string | null
    per100g: ConfirmedFood["per100g"]
  } | null
}

type PhotoEstimateApiResult =
  | { status: "unconfigured" }
  | { status: "no_foods_detected" }
  | { status: "error"; message: string }
  | { status: "ok"; items: DetectedItem[] }

type PanelPhase = "idle" | "uploading" | "analyzing" | "results" | "unconfigured" | "no_foods" | "error"

type PhotoEstimatePanelProps = {
  mealType: MealType
  onMealTypeChange: (mealType: MealType) => void
  onConfirmMultiple: (foods: ConfirmedFood[]) => void
  onSwitchToManual: (initialName?: string) => void
  onClose: () => void
}

export function PhotoEstimatePanel({
  mealType,
  onMealTypeChange,
  onConfirmMultiple,
  onSwitchToManual,
  onClose,
}: PhotoEstimatePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<PanelPhase>("idle")
  const [items, setItems] = useState<Array<DetectedItem & { grams: number; included: boolean }>>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const mealSelectId = useId()

  async function handleFile(file: File) {
    setPhase("uploading")

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

    setPhase("analyzing")

    try {
      const response = await fetch("/api/nutrition/photo-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        setErrorMessage(data.error ?? "Photo analysis failed.")
        setPhase("error")
        return
      }

      const result = data.result as PhotoEstimateApiResult

      if (result.status === "unconfigured") {
        setPhase("unconfigured")
        return
      }

      if (result.status === "no_foods_detected") {
        setPhase("no_foods")
        return
      }

      if (result.status === "error") {
        setErrorMessage(result.message)
        setPhase("error")
        return
      }

      setItems(
        result.items.map((item) => ({ ...item, grams: item.estimatedGrams, included: item.groundedFood !== null })),
      )
      setPhase("results")
    } catch {
      setErrorMessage("Photo analysis is temporarily unavailable.")
      setPhase("error")
    }
  }

  function updateGrams(index: number, grams: number) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, grams: Math.max(1, grams) } : item)))
  }

  function toggleIncluded(index: number) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, included: !item.included } : item)))
  }

  function handleConfirmAll() {
    const confirmed: ConfirmedFood[] = items
      .filter((item) => item.included && item.groundedFood)
      .map((item) => ({
        foodName: item.groundedFood!.name,
        source: item.groundedFood!.source,
        sourceId: item.groundedFood!.sourceId,
        per100g: item.groundedFood!.per100g,
        quantityGrams: item.grams,
        mealType,
        isEstimated: true,
        estimationConfidence: item.detectionConfidence,
        estimationReason: `Portion estimated from a photo (${item.detectionConfidence} confidence)${item.notes ? ` — ${item.notes}` : ""}.`,
      }))

    if (confirmed.length > 0) {
      onConfirmMultiple(confirmed)
    }
  }

  const totals = items
    .filter((item) => item.included && item.groundedFood)
    .reduce(
      (acc, item) => {
        const scaled = scaleMacrosToGrams(item.groundedFood!.per100g, item.grams)
        return {
          calories: acc.calories + scaled.calories,
          protein: acc.protein + scaled.protein,
          carbs: acc.carbs + scaled.carbs,
          fat: acc.fat + scaled.fat,
        }
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-bold text-white">Photo estimate</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          AI identifies likely foods and a rough portion; nutrition always comes from the food
          database, never invented by AI. Portions are approximate — edit anything before adding.
        </p>
      </div>

      {phase === "idle" ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-semibold text-white hover:border-amber-400/30"
          >
            <Camera className="size-6 text-amber-400" />
            Take photo
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-semibold text-white hover:border-amber-400/30"
          >
            <Upload className="size-6 text-amber-400" />
            Upload image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleFile(file)
            }}
          />
        </div>
      ) : null}

      {phase === "uploading" || phase === "analyzing" ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-sm text-zinc-400">
          <Loader2 className="size-6 animate-spin text-amber-400" />
          {phase === "uploading" ? "Preparing photo…" : "Analyzing meal…"}
        </div>
      ) : null}

      {phase === "unconfigured" ? (
        <StatusPanel
          title="Photo estimate isn't set up yet"
          message="This deployment hasn't configured a vision model. Use Scan Barcode, Search, or Manual Entry instead."
        />
      ) : null}

      {phase === "no_foods" ? (
        <StatusPanel title="No foods detected" message="Try a clearer, closer photo, or add this meal manually." />
      ) : null}

      {phase === "error" ? <StatusPanel title="Photo analysis unavailable" message={errorMessage ?? ""} /> : null}

      {phase === "results" ? (
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Meal</span>
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
          </label>

          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-400">AI-detected meal</p>

          <ul className="space-y-3">
            {items.map((item, index) => (
              <li key={`${item.detectedName}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.included}
                        disabled={!item.groundedFood}
                        onChange={() => toggleIncluded(index)}
                        className="size-4"
                      />
                      <span className="font-semibold capitalize text-white">{item.detectedName}</span>
                    </label>
                    <p className="mt-1 text-xs text-zinc-500">
                      Confidence: {item.detectionConfidence}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </p>
                    {!item.groundedFood ? (
                      <button
                        type="button"
                        onClick={() => onSwitchToManual(item.detectedName)}
                        className="mt-1 text-xs font-semibold text-amber-400 underline underline-offset-4"
                      >
                        No nutrition match — add manually
                      </button>
                    ) : null}
                  </div>

                  {item.groundedFood ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-xs text-zinc-500">~</span>
                      <input
                        type="number"
                        value={item.grams}
                        onChange={(event) => updateGrams(index, Number(event.target.value) || 0)}
                        className="h-9 w-16 rounded-lg border border-white/10 bg-black/30 px-2 text-center text-sm text-white"
                        aria-label={`Grams for ${item.detectedName}`}
                      />
                      <span className="text-xs text-zinc-500">g</span>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-amber-400">Estimated total</p>
            <p className="text-sm text-white">
              {Math.round(totals.calories)} kcal · {Math.round(totals.protein)} P / {Math.round(totals.carbs)} C /{" "}
              {Math.round(totals.fat)} F
            </p>
          </div>

          <button
            type="button"
            onClick={handleConfirmAll}
            disabled={!items.some((item) => item.included && item.groundedFood)}
            className="min-h-12 rounded-xl bg-amber-500 text-sm font-black uppercase tracking-wide text-black hover:bg-amber-400 disabled:opacity-40"
          >
            Confirm & Add
          </button>
        </div>
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

function StatusPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
      <p className="text-sm font-bold text-amber-300">{title}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-400">{message}</p>
    </div>
  )
}
