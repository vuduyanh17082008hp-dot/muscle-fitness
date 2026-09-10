"use client"

import { useState } from "react"
import Link from "next/link"

import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  ShoppingCart,
  Wallet,
} from "lucide-react"

import type { BudgetPlanResult } from "@/lib/nutrition/budget"
import { cn } from "@/lib/utils"

type BudgetPlannerProps = {
  initialBudget: number | null
  initialResult: BudgetPlanResult
  proteinTarget: number
  calorieTarget: number
}

const STATUS_COPY: Record<
  BudgetPlanResult["status"],
  { label: string; chip: string }
> = {
  no_budget: {
    label: "No budget set",
    chip: "border-white/10 bg-white/5 text-zinc-400",
  },
  within_budget: {
    label: "Within budget",
    chip: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  },
  budget_exceeded: {
    label: "Budget exceeded",
    chip: "border-rose-400/25 bg-rose-400/10 text-rose-300",
  },
}

export function BudgetPlanner({
  initialBudget,
  initialResult,
  proteinTarget,
  calorieTarget,
}: BudgetPlannerProps) {
  const [budgetInput, setBudgetInput] = useState(
    initialBudget !== null ? String(initialBudget) : "",
  )
  const [result, setResult] = useState<BudgetPlanResult>(initialResult)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  async function recompute(options: {
    weeklyBudget: number | null
    persist: boolean
    manualSubstitutions?: Array<{ from: string; to: string }>
  }) {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/nutrition/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update your budget plan.")
      }

      setResult(data.budgetPlan as BudgetPlanResult)

      if (options.persist) {
        setSavedMessage("Weekly budget saved.")
        window.setTimeout(() => setSavedMessage(null), 2500)
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to update your budget plan.",
      )
    } finally {
      setIsLoading(false)
    }
  }

  function handleUpdatePlan() {
    const trimmed = budgetInput.trim()
    const parsed = trimmed === "" ? null : Number(trimmed)

    if (trimmed !== "" && (!Number.isFinite(parsed) || (parsed as number) < 0)) {
      setError("Please enter a valid budget amount.")
      return
    }

    void recompute({ weeklyBudget: parsed, persist: true })
  }

  function handleAcceptSubstitution(fromFoodId: string, toFoodId: string) {
    const parsed = budgetInput.trim() === "" ? null : Number(budgetInput)

    void recompute({
      weeklyBudget: parsed,
      persist: false,
      manualSubstitutions: [{ from: fromFoodId, to: toFoodId }],
    })
  }

  const status = STATUS_COPY[result.status]

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-6 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
            <Wallet className="size-5" />
          </span>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-500">
              Budget-Aware Planner
            </p>
            <h2 className="text-xl font-bold text-white">
              Your plan within a real weekly budget
            </h2>
          </div>
        </div>

        <span
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em]",
            status.chip,
          )}
        >
          {status.label}
        </span>
      </div>

      {/* BUDGET INPUT */}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-zinc-400">
            Weekly food budget (SGD)
          </span>
          <input
            type="number"
            min={0}
            step={5}
            value={budgetInput}
            onChange={(event) => setBudgetInput(event.target.value)}
            placeholder="e.g. 80"
            className="w-40 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/40"
          />
        </label>

        <button
          type="button"
          onClick={handleUpdatePlan}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          Update Plan
        </button>

        {savedMessage ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="size-3.5" />
            {savedMessage}
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}

      {/* SUMMARY */}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Target calories" value={`${calorieTarget}`} suffix="kcal" />
        <SummaryTile label="Target protein" value={`${proteinTarget}`} suffix="g" />
        <SummaryTile
          label="Weekly budget"
          value={result.weeklyBudgetSgd !== null ? result.weeklyBudgetSgd.toFixed(2) : "—"}
          suffix="SGD"
        />
        <SummaryTile
          label="Estimated weekly cost"
          value={result.estimatedWeeklyCostSgd.toFixed(2)}
          suffix="SGD"
          accent={result.status === "budget_exceeded"}
        />
      </div>

      {result.status === "within_budget" && result.remainingSgd !== null ? (
        <p className="mt-4 text-sm text-emerald-300">
          Budget remaining: {result.remainingSgd.toFixed(2)} SGD / week.
        </p>
      ) : null}

      {result.status === "budget_exceeded" ? (
        <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-5">
          <p className="flex items-start gap-2 text-sm leading-6 text-rose-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Your current nutrition targets cannot be reasonably matched
            within this budget using the available food-price data
            {result.shortfallSgd !== null
              ? ` (about ${result.shortfallSgd.toFixed(2)} SGD short).`
              : "."}
          </p>

          <ul className="mt-3 space-y-1.5 text-xs leading-5 text-zinc-400">
            {result.alternatives.map((alternative, index) => (
              <li key={alternative} className="flex gap-2">
                <span className="font-bold text-rose-300">
                  {String.fromCharCode(65 + index)}.
                </span>
                {alternative}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* APPLIED SUBSTITUTIONS */}

      {result.appliedSubstitutions.length > 0 ? (
        <div className="mt-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">
            Substitutions applied to fit your budget
          </p>
          <div className="space-y-2">
            {result.appliedSubstitutions.map((sub, index) => (
              <SubstitutionRow key={`${sub.fromFoodId}-${sub.toFoodId}-${index}`} sub={sub} applied />
            ))}
          </div>
        </div>
      ) : null}

      {/* SUGGESTED SUBSTITUTIONS */}

      {result.suggestedSubstitutions.length > 0 ? (
        <div className="mt-6">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">
            <ArrowRightLeft className="size-3.5" />
            Swap an expensive food to save more
          </p>
          <div className="space-y-2">
            {result.suggestedSubstitutions.map((sub) => (
              <SubstitutionRow
                key={`${sub.fromFoodId}-${sub.toFoodId}`}
                sub={sub}
                onAccept={() => handleAcceptSubstitution(sub.fromFoodId, sub.toFoodId)}
                disabled={isLoading}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* SHOPPING LIST LINK */}

      <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-xs leading-5 text-zinc-500">
          Estimated weekly cost is based on your current 7-day shopping
          list — <span className="text-amber-300">ESTIMATED MARKET PRICE</span>, not a live feed.
        </p>

        <Link
          href="/dashboard/nutrition/shopping-list?days=7"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-zinc-200 transition hover:border-amber-400/30 hover:text-amber-200"
        >
          <ShoppingCart className="size-3.5" />
          View Shopping List
        </Link>
      </div>
    </section>
  )
}

function SummaryTile({
  label,
  value,
  suffix,
  accent,
}: {
  label: string
  value: string
  suffix: string
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        accent ? "border-rose-400/25 bg-rose-400/8" : "border-white/10 bg-white/[0.035]",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className={cn("mt-2 text-2xl font-black", accent ? "text-rose-300" : "text-white")}>
        {value}
        <span className="ml-1 text-sm font-semibold text-zinc-500">{suffix}</span>
      </p>
    </div>
  )
}

function SubstitutionRow({
  sub,
  applied,
  onAccept,
  disabled,
}: {
  sub: BudgetPlanResult["appliedSubstitutions"][number]
  applied?: boolean
  onAccept?: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
      <div className="text-sm text-zinc-300">
        <span className="font-semibold text-white">{sub.fromName}</span>
        <span className="mx-2 text-zinc-600">→</span>
        <span className="font-semibold text-amber-300">{sub.toName}</span>
        <p className="mt-1 text-xs text-zinc-500">
          Same functional role ({sub.category}) · estimated saving{" "}
          {sub.estimatedSavingSgd.toFixed(2)} SGD / week
        </p>
      </div>

      {applied ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
          <CheckCircle2 className="size-3" />
          Applied
        </span>
      ) : (
        <button
          type="button"
          onClick={onAccept}
          disabled={disabled}
          className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Accept swap
        </button>
      )}
    </div>
  )
}
