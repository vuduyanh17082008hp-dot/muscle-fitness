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
        const response = await fetch("/api/nutrition/next-action", { signal: AbortSignal.timeout(8000) })
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
    <div className="rounded-2xl border border-mf-glass-brand-border bg-gradient-to-br from-mf-glass-brand-soft to-transparent p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-mf-glass-brand" aria-hidden="true" />
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-mf-glass-brand">
          Next meal idea
        </p>
      </div>

      {/* When there are options the summary above already shows what is left; the message only explains an empty result. */}
      {message && state === "empty" ? <p className="mt-1.5 text-xs text-mf-glass-text-muted">{message}</p> : null}

      {state === "loading" ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-mf-glass-text-muted">
          <Loader2 className="size-3.5 animate-spin" /> Finding a good fit…
        </div>
      ) : null}

      {state === "ready" ? (
        <>
          <ul className="mt-3 space-y-2">{options.slice(0, 1).map(renderOption)}</ul>
          {options.length > 1 ? (
            <details className="mt-2">
              <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-mf-glass-text-muted hover:text-mf-glass-text">
                {options.length - 1} more idea{options.length === 2 ? "" : "s"}
              </summary>
              <ul className="space-y-2">{options.slice(1).map(renderOption)}</ul>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  )

  function renderOption(option: NextMealOption) {
    const primary = option.id === options[0]?.id
    return (
      <li
        key={option.id}
        className={`rounded-xl border p-3 ${primary ? "border-mf-glass-brand-border bg-mf-glass-brand-soft" : "border-mf-glass-border bg-white/[0.02]"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-mf-glass-text">{option.name}</p>
            {option.adjustments.length > 0 ? (
              <p className="mt-0.5 text-xs capitalize text-mf-glass-brand">
                {option.adjustments.join(" · ")}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-mf-glass-text-muted">
              ~{option.estimatedNutrition.calories} kcal · {option.estimatedNutrition.protein}g protein
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-mf-glass-text-muted">
              {option.provenance}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleLog(option)}
            disabled={loggingId !== null}
            className="min-h-11 shrink-0 rounded-lg border border-mf-glass-brand-border bg-mf-glass-brand-soft px-3 text-xs font-bold text-mf-glass-brand hover:bg-mf-glass-brand-soft disabled:opacity-40"
          >
            {loggingId === option.id ? "Logging…" : "Log this"}
          </button>
        </div>
      </li>
    )
  }
}
