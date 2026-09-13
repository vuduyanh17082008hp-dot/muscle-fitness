"use client"

import { useEffect, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"

import type { NextMealOption } from "@/lib/nutrition/next-action-engine"
import { suggestMealType } from "@/components/nutrition/meal-type"
import type { ConfirmedFood } from "@/components/nutrition/types"

/**
 * "Best next option" card (spec Part "5. NUTRITION NEXT-ACTION
 * ENGINE"). Deliberately compact — one primary suggestion plus a
 * couple of alternates — rather than a second tracker UI. All the
 * arithmetic already happened server-side in
 * lib/nutrition/next-action-engine.ts; this component only renders it
 * and, on tap, logs it through the SAME /api/nutrition/log endpoint
 * every other source uses.
 */

type FetchState = "loading" | "ready" | "empty" | "error"

export function NextMealCard({
  refreshKey,
  onLogged,
}: {
  /** Bump this (e.g. after any add/delete) to refetch — the server recomputes remaining macros from the real log each time. */
  refreshKey: number
  onLogged: (food: ConfirmedFood) => Promise<boolean>
}) {
  const [state, setState] = useState<FetchState>("loading")
  const [options, setOptions] = useState<NextMealOption[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loggingId, setLoggingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState("loading")

      try {
        const response = await fetch("/api/nutrition/next-action")
        const data = await response.json()

        if (cancelled) return

        if (!data.ok) {
          setState("error")
          return
        }

        setMessage(data.result.message)
        setOptions(data.result.options ?? [])
        setState(data.result.options?.length > 0 ? "ready" : "empty")
      } catch {
        if (!cancelled) setState("error")
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [refreshKey])

  async function handleLog(option: NextMealOption) {
    setLoggingId(option.id)

    try {
      await onLogged({
        foodName: option.logPayload.foodName,
        source: option.logPayload.source,
        sourceId: option.logPayload.sourceId,
        barcode: option.logPayload.barcode,
        per100g: option.logPayload.per100g,
        quantityGrams: option.logPayload.quantityGrams,
        mealType: suggestMealType(),
        isEstimated: option.logPayload.isEstimated,
        estimationReason: option.logPayload.estimationReason,
      })
    } finally {
      setLoggingId(null)
    }
  }

  if (state === "error") return null // non-essential — fail quietly rather than block the tracker

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-400/[0.06] to-transparent p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-amber-400" aria-hidden="true" />
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-400">
          Best next option
        </p>
      </div>

      {message ? <p className="mt-1.5 text-xs text-zinc-500">{message}</p> : null}

      {state === "loading" ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="size-3.5 animate-spin" /> Finding a good fit…
        </div>
      ) : null}

      {state === "ready" ? (
        <ul className="mt-3 space-y-2">
          {options.map((option, index) => (
            <li
              key={option.id}
              className={`rounded-xl border p-3 ${index === 0 ? "border-amber-400/25 bg-amber-400/[0.04]" : "border-white/10 bg-white/[0.02]"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{option.name}</p>
                  {option.adjustments.length > 0 ? (
                    <p className="mt-0.5 text-xs capitalize text-amber-300">
                      {option.adjustments.join(" · ")}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-zinc-500">
                    ~{option.estimatedNutrition.calories} kcal · {option.estimatedNutrition.protein}g protein
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-600">
                    {option.provenance}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleLog(option)}
                  disabled={loggingId !== null}
                  className="shrink-0 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-400/20 disabled:opacity-40"
                >
                  {loggingId === option.id ? "Logging…" : "Log this"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
