"use client"

import { useId, useRef, useState } from "react"
import { AlertTriangle, Camera, Loader2, Upload } from "lucide-react"

import { scaleMacrosToGrams } from "@/lib/nutrition/food-log-calculator"
import { MEAL_TYPES, MEAL_TYPE_LABEL, type MealType } from "@/lib/nutrition/food-log/types"
import type { FoodSearchStatus, NormalizedFood } from "@/lib/nutrition/food-data/types"
import { reviewFoodMatch } from "@/lib/nutrition/photo-match-review"
import type { ConfirmedFood } from "@/components/nutrition/types"

type DetectedItem = {
  detectedName: string
  estimatedGrams: number
  detectionConfidence: "high" | "medium" | "low"
  notes?: string
  groundedFood: NormalizedFood | null
  candidates?: NormalizedFood[]
  searchStatus?: FoodSearchStatus
}

type ReviewItem = DetectedItem & {
  candidates: NormalizedFood[]
  grams: number
  included: boolean
  /** Index into candidates the user has chosen; null when there is no usable match. */
  matchIndex: number | null
}

const selectedFood = (item: ReviewItem) => (item.matchIndex === null ? null : item.candidates[item.matchIndex] ?? null)

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
  const [items, setItems] = useState<ReviewItem[]>([])
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
        result.items.map((item) => {
          const candidates = item.candidates?.length ? item.candidates : item.groundedFood ? [item.groundedFood] : []
          return {
            ...item,
            candidates,
            grams: item.estimatedGrams,
            included: candidates.length > 0,
            matchIndex: candidates.length > 0 ? 0 : null,
          }
        }),
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

  function chooseMatch(index: number, matchIndex: number) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, matchIndex } : item)))
  }

  function toggleIncluded(index: number) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, included: !item.included } : item)))
  }

  function handleConfirmAll() {
    const confirmed: ConfirmedFood[] = items.flatMap((item) => {
      const food = selectedFood(item)
      if (!item.included || !food) return []
      return [{
        foodName: food.name,
        brand: food.brand ?? null,
        source: food.source,
        sourceId: food.sourceId,
        barcode: food.barcode ?? null,
        per100g: food.per100g,
        quantityGrams: item.grams,
        mealType,
        isEstimated: true,
        estimationConfidence: item.detectionConfidence,
        estimationReason: `Photo detected "${item.detectedName}" (${item.detectionConfidence} confidence), user-confirmed match "${food.name}" (${food.sourceLabel}, ${food.preparationState}); portion estimated${item.notes ? ` — ${item.notes}` : ""}.`,
      }]
    })

    if (confirmed.length > 0) {
      onConfirmMultiple(confirmed)
    }
  }

  const totals = items
    .filter((item) => item.included && selectedFood(item))
    .reduce(
      (acc, item) => {
        const scaled = scaleMacrosToGrams(selectedFood(item)!.per100g, item.grams)
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
            {items.map((item, index) => {
              const food = selectedFood(item)
              const flags = food ? reviewFoodMatch(item.detectedName, food, item.searchStatus) : []
              return (
              <li key={`${item.detectedName}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.included}
                        disabled={!food}
                        onChange={() => toggleIncluded(index)}
                        className="size-4"
                      />
                      <span className="font-semibold capitalize text-white">{item.detectedName}</span>
                    </label>
                    <p className="mt-1 text-xs text-zinc-500">
                      Detection confidence: {item.detectionConfidence}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </p>
                  </div>

                  {food ? (
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

                {food ? (
                  <div className="mt-3 border-t border-white/5 pt-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">Nutrition from</p>
                    <p className="mt-0.5 text-xs text-zinc-300">
                      {food.name}
                      {food.brand ? ` (${food.brand})` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {food.sourceLabel} · {food.preparationState} · {Math.round(food.per100g.calories)} kcal / 100 g
                    </p>

                    {flags.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {flags.map((flag) => (
                          <li key={flag.kind} className="flex items-start gap-1.5 text-xs text-amber-300">
                            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                            {flag.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {item.candidates.length > 1 ? (
                      <label className="mt-2 block">
                        <span className="sr-only">Choose a different nutrition match for {item.detectedName}</span>
                        <select
                          value={item.matchIndex ?? 0}
                          onChange={(event) => chooseMatch(index, Number(event.target.value))}
                          className="h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-xs text-white"
                        >
                          {item.candidates.map((candidate, candidateIndex) => (
                            <option key={candidate.id} value={candidateIndex}>
                              {candidate.name} — {candidate.sourceLabel}, {candidate.preparationState}, {Math.round(candidate.per100g.calories)} kcal/100 g
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => onSwitchToManual(item.detectedName)}
                  className="mt-2 text-xs font-semibold text-amber-400 underline underline-offset-4"
                >
                  {food ? "None of these — add manually" : "No nutrition match — add manually"}
                </button>
              </li>
              )
            })}
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
            disabled={!items.some((item) => item.included && selectedFood(item))}
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
