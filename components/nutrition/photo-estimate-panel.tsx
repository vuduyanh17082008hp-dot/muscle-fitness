"use client"

import { useId, useRef, useState } from "react"
import { AlertTriangle, Camera, ImagePlus, Loader2, Plus, Upload, X } from "lucide-react"

import { scaleMacrosToGrams } from "@/lib/nutrition/food-log-calculator"
import { MEAL_TYPES, MEAL_TYPE_LABEL, type MealType } from "@/lib/nutrition/food-log/types"
import type { FoodSearchStatus, NormalizedFood, NormalizedFoodMacros } from "@/lib/nutrition/food-data/types"
import {
  COOKING_METHODS,
  COOKING_METHOD_LABEL,
  NUTRIENT_PROVENANCE_LABEL,
  applyEatenSuggestions,
  candidateIndexForMethod,
  eatenGrams,
  needsCookingQuestion,
  nutrientProvenance,
  reviewFoodMatch,
  suggestedOilGrams,
  type CookingMethod,
  type EatenSource,
  type EatenSuggestion,
} from "@/lib/nutrition/photo-match-review"
import { FoodSearchPanel } from "@/components/nutrition/food-search-panel"
import { ManualFoodForm } from "@/components/nutrition/manual-food-form"
import type { ConfirmedFood } from "@/components/nutrition/types"

export type DetectedItem = {
  detectedName: string
  estimatedGrams: number
  detectionConfidence: "high" | "medium" | "low"
  notes?: string
  preparation?: CookingMethod
  preparationCertain?: boolean
  dish?: string | null
  groundedFood: NormalizedFood | null
  candidates?: NormalizedFood[]
  searchStatus?: FoodSearchStatus
  searchPartial?: boolean
  fromTemplate?: boolean
  optional?: boolean
  noAddedOil?: boolean
}

type ReviewItem = DetectedItem & {
  /** Shared identity of this component across the before and after photos. */
  key: string
  candidates: NormalizedFood[]
  /** Served portion on the plate. */
  grams: number
  included: boolean
  /** Index into candidates the user has chosen; null when there is no usable match. */
  matchIndex: number | null
  /** The user picked a match themselves — a method change no longer switches it. */
  matchPicked: boolean
  method: CookingMethod
  /** The user picked (or confirmed) the method — no more question for this item. */
  methodSet: boolean
  oilGrams: number
  /** The user typed an oil amount — method/portion changes no longer overwrite it. */
  oilEdited: boolean
  eatenPercent: number
  eatenSource: EatenSource
  /** The after photo's suggestion, kept beside whatever percentage is set. */
  suggestion: EatenSuggestion | null
}

/** A review that starts from a dish template or a menu pick instead of a photo. */
export type ReviewSeed = { title: string; note?: string; items: DetectedItem[]; cookingOil: NormalizedFood | null }

const selectedFood = (item: ReviewItem) => (item.matchIndex === null ? null : item.candidates[item.matchIndex] ?? null)

type PhotoEstimateApiResult =
  | { status: "unconfigured" }
  | { status: "no_foods_detected" }
  | { status: "error"; message: string }
  | { status: "ok"; items: DetectedItem[]; cookingOil?: NormalizedFood | null }

type LeftoversApiResult =
  | { status: "unconfigured" }
  | { status: "error"; message: string }
  | { status: "not_same_meal"; reason: string }
  | { status: "ok"; components: EatenSuggestion[] }

type PanelPhase = "idle" | "preparing" | "analyzing" | "results" | "unconfigured" | "no_foods" | "error"
type AfterPhase = "idle" | "preparing" | "comparing" | "done" | "error"

type PhotoEstimatePanelProps = {
  mealType: MealType
  onMealTypeChange: (mealType: MealType) => void
  onConfirmMultiple: (foods: ConfirmedFood[]) => void
  onClose: () => void
  seed?: ReviewSeed
}

const EATEN_STEPS = [100, 75, 50, 25, 0]
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const MAX_EDGE_PX = 1280

/**
 * Decode → downscale → re-encode as JPEG. Keeps the request small, turns any
 * browser-decodable format into one the model accepts, and drops EXIF (GPS)
 * metadata, so the original file never leaves the device.
 */
export async function prepareImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image. Choose a photo (JPEG, PNG, WebP).")
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("That photo is over 20 MB. Choose a smaller one.")

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error("This image couldn't be read on this device. Try a JPEG or PNG photo.")
  }
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL("image/jpeg", 0.85)
}

const sumMacros = (rows: { per100g: NormalizedFoodMacros; grams: number }[]) =>
  rows.reduce(
    (acc, row) => {
      const scaled = scaleMacrosToGrams(row.per100g, row.grams)
      return {
        calories: acc.calories + scaled.calories,
        protein: acc.protein + scaled.protein,
        carbs: acc.carbs + scaled.carbs,
        fat: acc.fat + scaled.fat,
      }
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )

function toReviewItems(detected: DetectedItem[], cookingOil: NormalizedFood | null): ReviewItem[] {
  return detected.map((item, index) => {
    const candidates = item.candidates?.length ? item.candidates : item.groundedFood ? [item.groundedFood] : []
    const method = item.preparation ?? "unknown"
    const options = { noAddedOil: item.noAddedOil }
    return {
      ...item,
      key: `c${index}`,
      candidates,
      grams: item.estimatedGrams,
      included: candidates.length > 0 && !item.optional,
      matchIndex: candidates.length > 0 ? 0 : null,
      matchPicked: false,
      method,
      methodSet: !needsCookingQuestion(method, item.preparationCertain ?? false, candidates[0], options),
      oilGrams: candidates[0] && cookingOil ? suggestedOilGrams(method, item.estimatedGrams, candidates[0], options) : 0,
      oilEdited: false,
      eatenPercent: 100,
      eatenSource: "default",
      suggestion: null,
    }
  })
}

export function PhotoEstimatePanel({ mealType, onMealTypeChange, onConfirmMultiple, onClose, seed }: PhotoEstimatePanelProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const afterCameraRef = useRef<HTMLInputElement>(null)
  const afterUploadRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<PanelPhase>(seed ? "results" : "idle")
  const [items, setItems] = useState<ReviewItem[]>(() => (seed ? toReviewItems(seed.items, seed.cookingOil) : []))
  const [cookingOil, setCookingOil] = useState<NormalizedFood | null>(seed?.cookingOil ?? null)
  /** Foods the user added or substituted by search / manual entry — logged exactly as entered. */
  const [extras, setExtras] = useState<ConfirmedFood[]>([])
  const [adding, setAdding] = useState<{ via: "search" | "manual"; replaces: number | null; name?: string } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [beforeImage, setBeforeImage] = useState<string | null>(null)
  const [after, setAfter] = useState<{ phase: AfterPhase; image: string | null; message: string | null }>({ phase: "idle", image: null, message: null })
  const mealSelectId = useId()

  async function handleFile(file: File) {
    setErrorMessage(null)
    setPhase("preparing")

    let dataUrl: string
    try {
      dataUrl = await prepareImage(file)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "This image couldn't be read.")
      setPhase("error")
      return
    }

    setPhase("analyzing")

    try {
      const response = await fetch("/api/nutrition/photo-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok || !data?.ok) {
        setErrorMessage(data?.error ?? "Photo analysis failed. Nothing was logged.")
        setPhase("error")
        return
      }

      const result = data.result as PhotoEstimateApiResult

      if (result.status === "unconfigured") return setPhase("unconfigured")
      if (result.status === "no_foods_detected") return setPhase("no_foods")
      if (result.status === "error") {
        setErrorMessage(`${result.message} Nothing was logged.`)
        setPhase("error")
        return
      }

      setCookingOil(result.cookingOil ?? null)
      setExtras([])
      setBeforeImage(dataUrl)
      setAfter({ phase: "idle", image: null, message: null })
      setItems(toReviewItems(result.items, result.cookingOil ?? null))
      setPhase("results")
    } catch {
      setErrorMessage("Photo analysis is temporarily unavailable. Nothing was logged.")
      setPhase("error")
    }
  }

  function onPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) void handleFile(file)
  }

  /** Compares the after photo with the reviewed BEFORE meal. Any failure leaves the review exactly as it was. */
  async function handleAfterFile(file: File) {
    if (!beforeImage) return
    const reviewed = items.filter((item) => item.included && selectedFood(item) && item.grams > 0)
    if (reviewed.length === 0) return
    setAfter({ phase: "preparing", image: null, message: null })

    let dataUrl: string
    try {
      dataUrl = await prepareImage(file)
    } catch (error) {
      setAfter({ phase: "error", image: null, message: error instanceof Error ? error.message : "This image couldn't be read." })
      return
    }
    setAfter({ phase: "comparing", image: dataUrl, message: null })

    try {
      const response = await fetch("/api/nutrition/photo-leftovers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          before: beforeImage,
          after: dataUrl,
          components: reviewed.map((item) => ({ id: item.key, name: item.detectedName, servedGrams: item.grams })),
        }),
      })
      const data = await response.json().catch(() => null)
      const failed = (message: string) => setAfter({ phase: "error", image: dataUrl, message: `${message} Your review is unchanged — set the amounts yourself.` })
      if (!response.ok || !data?.ok) return failed(data?.error ?? "The after photo couldn't be compared.")

      const result = data.result as LeftoversApiResult
      if (result.status === "unconfigured") return failed("After-photo comparison isn't set up on this deployment.")
      if (result.status === "error") return failed(result.message)
      if (result.status === "not_same_meal") return failed(`That doesn't look like the same meal (${result.reason}).`)

      setItems((current) => applyEatenSuggestions(current, result.components))
      const unknown = result.components.filter((c) => c.eatenPercent === null).length
      setAfter({
        phase: "done",
        image: dataUrl,
        message: unknown > 0 ? `${unknown} item${unknown === 1 ? "" : "s"} couldn't be judged from the photos — set ${unknown === 1 ? "it" : "them"} yourself.` : null,
      })
    } catch {
      setAfter({ phase: "error", image: dataUrl, message: "The after photo couldn't be compared right now. Your review is unchanged — set the amounts yourself." })
    }
  }

  function onAfterPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) void handleAfterFile(file)
  }

  /** Drops the after photo and the percentages it set; values the user typed stay. */
  function removeAfterPhoto() {
    setItems((current) =>
      current.map((item) => ({ ...item, suggestion: null, ...(item.eatenSource === "after_photo" ? { eatenPercent: 100, eatenSource: "default" as const } : {}) })),
    )
    setAfter({ phase: "idle", image: null, message: null })
  }

  /** Applies a change and re-derives the oil default unless the user has typed their own amount. */
  function updateItem(index: number, change: Partial<ReviewItem>) {
    setItems((current) =>
      current.map((item, i) => {
        if (i !== index) return item
        const next = { ...item, ...change }
        // A new cooking method can mean a different record (raw ↔ cooked) — unless the user chose the match.
        if (change.method !== undefined && !next.matchPicked && next.matchIndex !== null) {
          next.matchIndex = candidateIndexForMethod(next.detectedName, next.candidates, next.matchIndex, next.method)
        }
        const food = selectedFood(next)
        if (!next.oilEdited && change.oilGrams === undefined) {
          next.oilGrams = food && cookingOil ? suggestedOilGrams(next.method, next.grams, food, { noAddedOil: next.noAddedOil }) : 0
        }
        return next
      }),
    )
  }

  function startOver() {
    setItems([])
    setExtras([])
    setAdding(null)
    setErrorMessage(null)
    setBeforeImage(null)
    setAfter({ phase: "idle", image: null, message: null })
    setPhase("idle")
  }

  function handleConfirmAll() {
    const origin = seed ? `${seed.title}` : "Photo estimate"
    const confirmed: ConfirmedFood[] = items.flatMap((item) => {
      const food = selectedFood(item)
      const grams = eatenGrams(item.grams, item.eatenPercent)
      if (!item.included || !food || grams <= 0) return []

      const corrected =
        item.grams !== item.estimatedGrams || item.matchIndex !== 0 || item.eatenSource === "user" || item.method !== (item.preparation ?? "unknown")
      const eaten =
        item.eatenSource === "after_photo"
          ? `ate ${item.eatenPercent}% (after-photo suggestion, confirmed)`
          : item.suggestion && item.suggestion.eatenPercent !== null
            ? `ate ${item.eatenPercent}% (after photo suggested ${item.suggestion.eatenPercent}%)`
            : `ate ${item.eatenPercent}%`
      const reason = [
        `${origin}: ${item.fromTemplate ? "typical dish part" : "detected"} "${item.detectedName}" (${item.detectionConfidence} confidence)${item.dish ? ` in ${item.dish}` : ""}`,
        `matched "${food.name}" (${food.sourceLabel}, ${food.preparationState})`,
        `cooking ${COOKING_METHOD_LABEL[item.method].toLowerCase()}`,
        `served ~${item.grams} g, ${eaten}`,
        corrected ? "user-corrected" : "portion unedited",
      ].join("; ").slice(0, 480)

      const rows: ConfirmedFood[] = [{
        foodName: food.name,
        brand: food.brand ?? null,
        source: food.source,
        sourceId: food.sourceId,
        barcode: food.barcode ?? null,
        per100g: food.per100g,
        quantityGrams: grams,
        mealType,
        isEstimated: true,
        estimationConfidence: item.detectionConfidence,
        estimationReason: reason,
      }]

      const oil = eatenGrams(item.oilGrams, item.eatenPercent)
      if (cookingOil && oil > 0) {
        rows.push({
          foodName: `Cooking oil (with ${item.detectedName})`.slice(0, 120),
          source: cookingOil.source,
          sourceId: cookingOil.sourceId ?? cookingOil.id,
          per100g: cookingOil.per100g,
          quantityGrams: oil,
          mealType,
          isEstimated: true,
          estimationConfidence: "low",
          estimationReason: `${origin}: assumed oil for ${COOKING_METHOD_LABEL[item.method].toLowerCase()} "${item.detectedName}" — not visible; ${item.oilEdited ? "amount set by user" : "default amount"}; ate ${item.eatenPercent}%.`.slice(0, 480),
        })
      }
      return rows
    })

    const all = [...confirmed, ...extras.map((food) => ({ ...food, mealType }))]
    if (all.length > 0) onConfirmMultiple(all)
  }

  const eatenRows = items.flatMap((item) => {
    const food = selectedFood(item)
    if (!item.included || !food) return []
    const rows = [{ per100g: food.per100g, grams: eatenGrams(item.grams, item.eatenPercent) }]
    if (cookingOil && item.oilGrams > 0) rows.push({ per100g: cookingOil.per100g, grams: eatenGrams(item.oilGrams, item.eatenPercent) })
    return rows
  })
  const totals = sumMacros([...eatenRows, ...extras.map((food) => ({ per100g: food.per100g, grams: food.quantityGrams }))])
  const canConfirm = eatenRows.some((row) => row.grams > 0) || extras.length > 0
  const question = items.findIndex((item) => item.included && selectedFood(item) && !item.methodSet)
  const canCompare = Boolean(beforeImage) && items.some((item) => item.included && selectedFood(item))

  if (adding) {
    const accept = (food: ConfirmedFood) => {
      setExtras((current) => [...current, { ...food, isEstimated: food.isEstimated ?? false }])
      if (adding.replaces !== null) updateItem(adding.replaces, { included: false })
      setAdding(null)
    }
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-zinc-500">Your review is kept — this food is added to it, not logged yet.</p>
        {adding.via === "search" ? (
          <FoodSearchPanel mealType={mealType} onMealTypeChange={onMealTypeChange} onConfirm={accept} onClose={() => setAdding(null)} confirmLabel="Add to review" />
        ) : (
          <ManualFoodForm mealType={mealType} onMealTypeChange={onMealTypeChange} onConfirm={accept} onClose={() => setAdding(null)} initialName={adding.name} confirmLabel="Add to review" />
        )}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <h3 className="text-lg font-bold text-white">{seed ? seed.title : "Food photo"}</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          {seed
            ? "Typical parts of this dish, priced from reference data. Untick what you didn't have, fix the amounts, then log only what you ate."
            : "AI names likely foods and guesses portions; nutrients come from the food database, never from the AI. Check it, then log only what you ate."}{" "}
          Nothing is saved until you confirm.
        </p>
        {seed?.note ? <p className="mt-1 text-xs leading-5 text-amber-300">{seed.note}</p> : null}
      </div>

      {phase === "idle" ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-semibold text-white hover:border-amber-400/30"
          >
            <Camera className="size-6 text-amber-400" />
            Take photo
          </button>
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-semibold text-white hover:border-amber-400/30"
          >
            <Upload className="size-6 text-amber-400" />
            Upload image
          </button>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Take a meal photo" onChange={onPicked} />
          <input ref={uploadInputRef} type="file" accept="image/*" className="hidden" aria-label="Upload a meal photo" onChange={onPicked} />
        </div>
      ) : null}

      {phase === "preparing" || phase === "analyzing" ? (
        <div role="status" className="flex flex-col items-center justify-center gap-3 py-10 text-sm text-zinc-400">
          <Loader2 className="size-6 animate-spin text-amber-400" />
          {phase === "preparing" ? "Preparing photo…" : "Analyzing meal…"}
        </div>
      ) : null}

      {phase === "unconfigured" ? (
        <StatusPanel
          title="Photo estimate isn't set up yet"
          message="This deployment hasn't configured a vision model. Use Scan Barcode, Search, or Manual Entry instead."
        />
      ) : null}

      {phase === "no_foods" ? (
        <StatusPanel title="No food found in this photo" message="Try a clearer, closer photo of the plate, or add the meal by search. Nothing was logged." onRetry={startOver} />
      ) : null}

      {phase === "error" ? <StatusPanel title="Food identification unavailable" message={errorMessage ?? ""} onRetry={startOver} /> : null}

      {phase === "results" ? (
        <div className="flex min-w-0 flex-col gap-4">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Meal</span>
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

          {beforeImage ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3" data-testid="before-after">
              <div className="grid grid-cols-2 gap-2">
                <figure className="min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
                  <img src={beforeImage} alt="Before: your meal as served" className="aspect-square w-full rounded-xl object-cover" />
                  <figcaption className="mt-1 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">Before</figcaption>
                </figure>
                <figure className="min-w-0">
                  {after.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
                    <img src={after.image} alt="After: what was left" className="aspect-square w-full rounded-xl object-cover" />
                  ) : (
                    <div className="grid aspect-square w-full place-items-center rounded-xl border border-dashed border-white/15 p-2 text-center text-xs text-zinc-500">
                      Optional: photo of what&apos;s left
                    </div>
                  )}
                  <figcaption className="mt-1 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">After</figcaption>
                </figure>
              </div>

              {after.phase === "preparing" || after.phase === "comparing" ? (
                <p role="status" className="mt-3 flex items-center justify-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="size-4 animate-spin text-amber-400" /> Comparing with your reviewed meal…
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={!canCompare}
                    onClick={() => afterCameraRef.current?.click()}
                    className="flex min-h-10 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    <Camera className="size-4 text-amber-400" /> {after.image ? "Retake after photo" : "Take after photo"}
                  </button>
                  <button
                    type="button"
                    disabled={!canCompare}
                    onClick={() => afterUploadRef.current?.click()}
                    className="flex min-h-10 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    <ImagePlus className="size-4 text-amber-400" /> Upload after photo
                  </button>
                  {after.image ? (
                    <button type="button" onClick={removeAfterPhoto} className="min-h-10 px-2 text-xs font-semibold text-zinc-400 underline underline-offset-4">
                      Remove after photo
                    </button>
                  ) : null}
                </div>
              )}
              <input ref={afterCameraRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Take an after photo" onChange={onAfterPicked} />
              <input ref={afterUploadRef} type="file" accept="image/*" className="hidden" aria-label="Upload an after photo" onChange={onAfterPicked} />
              {after.message ? (
                <p role={after.phase === "error" ? "alert" : "status"} className="mt-2 text-center text-xs text-amber-300">
                  {after.message}
                </p>
              ) : null}
              {after.phase === "done" ? (
                <p className="mt-2 text-center text-xs text-zinc-500">The eaten amounts below are AI suggestions from the two photos, not measurements. Adjust any of them.</p>
              ) : null}
            </section>
          ) : null}

          {question >= 0 ? (
            <div className="rounded-2xl border border-sky-400/30 bg-sky-400/5 p-4" data-testid="cooking-question">
              <p className="text-sm font-semibold text-white">
                How was the {items[question].detectedName} prepared?
              </p>
              <p className="mt-1 text-xs text-zinc-400">The photo can&apos;t tell, and added oil changes the calories.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["boiled", "steamed", "grilled", "roasted", "stir_fried", "fried", "deep_fried", "air_fried", "raw"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => updateItem(question, { method, methodSet: true })}
                    className="min-h-9 rounded-full border border-white/15 px-3 text-xs font-semibold text-white hover:border-sky-400/50"
                  >
                    {COOKING_METHOD_LABEL[method]}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => updateItem(question, { methodSet: true })}
                  className="min-h-9 rounded-full px-3 text-xs font-semibold text-zinc-400 underline underline-offset-4"
                >
                  Skip
                </button>
              </div>
            </div>
          ) : null}

          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">{seed ? "Dish components — estimate" : "AI-detected meal — estimate"}</p>

          <ul className="space-y-3">
            {items.map((item, index) => {
              const food = selectedFood(item)
              const flags = food ? reviewFoodMatch(item.detectedName, food, item.searchStatus, item.searchPartial) : []
              const eaten = food ? sumMacros([{ per100g: food.per100g, grams: eatenGrams(item.grams, item.eatenPercent) }]) : null
              const provenance = nutrientProvenance(food)
              return (
                <li key={item.key} className={`min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4 ${item.included ? "" : "opacity-60"}`}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={item.included}
                      disabled={!food}
                      onChange={() => updateItem(index, { included: !item.included })}
                      className="mt-1 size-4 shrink-0"
                      aria-label={`Include ${item.detectedName}`}
                    />
                    <span className="min-w-0">
                      <span className="block break-words font-semibold text-white first-letter:uppercase">{item.detectedName}</span>
                      <span className="mt-0.5 block break-words text-xs text-zinc-500">
                        {item.dish ? `Part of ${item.dish} · ` : ""}
                        {item.fromTemplate ? (item.optional ? "Optional — tick it if you had it" : seed ? "Typical recipe part" : "Typical part, not seen in the photo") : `AI confidence (not accuracy): ${item.detectionConfidence}`}
                        {item.notes && !item.fromTemplate ? ` · ${item.notes}` : ""}
                      </span>
                      {item.fromTemplate && item.notes ? <span className="mt-0.5 block break-words text-xs text-zinc-500">{item.notes}</span> : null}
                    </span>
                  </label>

                  {food && item.included ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="block min-w-0">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Served (g)</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={1}
                          max={2000}
                          value={item.grams}
                          onChange={(event) => updateItem(index, { grams: Math.min(2000, Math.max(1, Number(event.target.value) || 0)) })}
                          className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-white"
                          aria-label={`Grams for ${item.detectedName}`}
                        />
                      </label>
                      <label className="block min-w-0">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Cooking</span>
                        <select
                          value={item.method}
                          onChange={(event) => updateItem(index, { method: event.target.value as CookingMethod, methodSet: true })}
                          className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-white"
                          aria-label={`Cooking method for ${item.detectedName}`}
                        >
                          {COOKING_METHODS.map((method) => (
                            <option key={method} value={method}>
                              {COOKING_METHOD_LABEL[method]}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="col-span-2">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">How much did you eat?</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {EATEN_STEPS.map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              aria-pressed={item.eatenPercent === pct}
                              onClick={() => updateItem(index, { eatenPercent: pct, eatenSource: "user" })}
                              className={`min-h-9 min-w-12 rounded-lg border px-2 text-xs font-bold ${item.eatenPercent === pct ? "border-amber-400 bg-amber-400/15 text-amber-300" : "border-white/10 text-zinc-300"}`}
                            >
                              {pct}%
                            </button>
                          ))}
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={100}
                            value={item.eatenPercent}
                            onChange={(event) => updateItem(index, { eatenPercent: Math.min(100, Math.max(0, Math.round(Number(event.target.value) || 0))), eatenSource: "user" })}
                            className="h-9 w-16 rounded-lg border border-white/10 bg-black/30 px-2 text-center text-xs text-white"
                            aria-label={`Percent eaten of ${item.detectedName}`}
                          />
                        </div>
                        {item.suggestion ? (
                          <p className="mt-1 text-xs text-sky-300" data-testid="after-suggestion">
                            {item.suggestion.eatenPercent === null
                              ? `After photo: couldn't tell${item.suggestion.note ? ` (${item.suggestion.note})` : ""} — set it yourself.`
                              : `After photo suggests ~${item.suggestion.eatenPercent}% eaten (${item.suggestion.confidence} confidence)${item.eatenSource === "user" ? " — your value is kept" : ""}.`}
                          </p>
                        ) : null}
                      </div>

                      {cookingOil && (item.oilGrams > 0 || item.oilEdited) ? (
                        <label className="col-span-2 flex flex-wrap items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-xs text-zinc-300">
                          <span className="min-w-0 flex-1">+ Added oil (assumed, not visible)</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            value={item.oilGrams}
                            onChange={(event) => updateItem(index, { oilGrams: Math.min(100, Math.max(0, Number(event.target.value) || 0)), oilEdited: true })}
                            className="h-9 w-16 rounded-lg border border-white/10 bg-black/30 px-2 text-center text-xs text-white"
                            aria-label={`Added oil grams for ${item.detectedName}`}
                          />
                          <span>g</span>
                        </label>
                      ) : null}

                      {eaten ? (
                        <p className="col-span-2 text-xs text-zinc-400">
                          Eaten: {eatenGrams(item.grams, item.eatenPercent)} g · {Math.round(eaten.calories)} kcal · {Math.round(eaten.protein)} g protein
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {food ? (
                    <div className="mt-3 border-t border-white/5 pt-3">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
                        Nutrition from · <span className={provenance === "VERIFIED_REFERENCE" ? "text-emerald-400" : "text-amber-300"}>{NUTRIENT_PROVENANCE_LABEL[provenance]}</span>
                      </p>
                      <p className="mt-0.5 break-words text-xs text-zinc-300">
                        {food.name}
                        {food.brand ? ` (${food.brand})` : ""}
                      </p>
                      <p className="break-words text-xs text-zinc-500">
                        {food.sourceLabel} · {food.preparationState} · {Math.round(food.per100g.calories)} kcal / 100 g
                      </p>
                      {food.estimationReason ? <p className="mt-0.5 break-words text-xs text-zinc-500">{food.estimationReason}</p> : null}

                      {flags.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {flags.map((flag) => (
                            <li key={flag.kind} className="flex items-start gap-1.5 text-xs text-amber-300">
                              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                              <span className="min-w-0 break-words">{flag.message}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {item.candidates.length > 1 ? (
                        <label className="mt-2 block">
                          <span className="sr-only">Choose a different nutrition match for {item.detectedName}</span>
                          <select
                            value={item.matchIndex ?? 0}
                            onChange={(event) => updateItem(index, { matchIndex: Number(event.target.value), matchPicked: true })}
                            className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-xs text-white"
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
                  ) : (
                    <p className="mt-2 text-xs text-amber-300">
                      {item.searchStatus === "provider_timeout" || item.searchStatus === "provider_error"
                        ? "The food databases didn't respond, so this item couldn't be matched. No nutrients are assumed for it."
                        : "No database match, so no nutrients are assumed for this item."}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <button
                      type="button"
                      onClick={() => setAdding({ via: "search", replaces: index })}
                      className="text-xs font-semibold text-amber-400 underline underline-offset-4"
                    >
                      {food ? "Wrong food — search instead" : "Find it by search"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdding({ via: "manual", replaces: index, name: item.detectedName })}
                      className="text-xs font-semibold text-zinc-400 underline underline-offset-4"
                    >
                      Enter nutrients manually
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          {extras.length > 0 ? (
            <ul className="space-y-2">
              {extras.map((food, index) => {
                const macros = sumMacros([{ per100g: food.per100g, grams: food.quantityGrams }])
                return (
                  <li key={food.idempotencyKey ?? `${food.foodName}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="min-w-0 text-xs text-zinc-300">
                      <span className="block break-words font-semibold text-white">{food.foodName}</span>
                      Added by you · {food.quantityGrams} g · {Math.round(macros.calories)} kcal
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${food.foodName}`}
                      onClick={() => setExtras((current) => current.filter((_, i) => i !== index))}
                      className="grid size-9 shrink-0 place-items-center rounded-full text-zinc-400 hover:bg-white/10"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}

          <button
            type="button"
            onClick={() => setAdding({ via: "search", replaces: null })}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-sm font-semibold text-zinc-300 hover:border-amber-400/40"
          >
            <Plus className="size-4" /> Add a missing food
          </button>

          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4" data-testid="photo-eaten-total">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-amber-400">Estimated total eaten</p>
            <p className="text-base font-bold text-white">{Math.round(totals.calories)} kcal</p>
            <p className="text-sm text-zinc-300">
              {Math.round(totals.protein)} g protein · {Math.round(totals.carbs)} g carbs · {Math.round(totals.fat)} g fat
            </p>
          </div>

          <button
            type="button"
            onClick={handleConfirmAll}
            disabled={!canConfirm || after.phase === "preparing" || after.phase === "comparing"}
            className="min-h-12 rounded-xl bg-amber-500 text-sm font-black uppercase tracking-wide text-black hover:bg-amber-400 disabled:opacity-40"
          >
            Confirm & log what I ate
          </button>
          {seed ? null : (
            <button type="button" onClick={startOver} className="text-xs font-semibold text-zinc-400 underline underline-offset-4">
              Use a different photo
            </button>
          )}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        className="min-h-11 rounded-xl border border-white/10 text-sm font-semibold text-zinc-400 hover:bg-white/5"
      >
        {phase === "results" ? "Discard estimate" : "Cancel"}
      </button>
    </div>
  )
}

export function StatusPanel({ title, message, onRetry, retryLabel = "Try another photo" }: { title: string; message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
      <p className="text-sm font-bold text-amber-300">{title}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-400">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-3 min-h-10 rounded-lg border border-white/15 px-4 text-xs font-semibold text-white">
          {retryLabel}
        </button>
      ) : null}
    </div>
  )
}
