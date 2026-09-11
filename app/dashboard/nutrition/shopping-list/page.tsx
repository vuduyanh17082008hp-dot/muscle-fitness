import Link from "next/link"
import { redirect } from "next/navigation"

import { AlertTriangle, ArrowLeft, ShoppingCart } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import {
  buildShoppingList,
  DEFAULT_SHOPPING_LIST_DAYS,
  isValidShoppingListDays,
  SHOPPING_LIST_DAY_OPTIONS,
  type ShoppingListDayOption,
} from "@/lib/nutrition/shopping-list"
import { estimateShoppingListCost } from "@/lib/nutrition/food-prices"

import { ShoppingListClient } from "./shopping-list-client"

export const dynamic = "force-dynamic"

type ShoppingListPageProps = {
  searchParams: Promise<{ days?: string }>
}

function parseDays(value: string | undefined): ShoppingListDayOption {
  const parsed = Number.parseInt(value ?? "", 10)
  return isValidShoppingListDays(parsed) ? parsed : DEFAULT_SHOPPING_LIST_DAYS
}

export default async function ShoppingListPage({ searchParams }: ShoppingListPageProps) {
  const params = await searchParams
  const days = parseDays(params.days)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/dashboard/nutrition/shopping-list")
  }

  const { plan, missingRequiredFields } = await loadNutritionContext(supabase, user.id)

  if (!plan) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-8">
          <span className="inline-grid size-14 place-items-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
            <ShoppingCart className="size-6" />
          </span>

          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
            Shopping List
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            No meal plan yet
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">
            We can&apos;t build a shopping list until your nutrition plan is
            available. Missing: {missingRequiredFields.join(", ")}.
          </p>

          <Link
            href="/onboarding?edit=1"
            className="mt-6 inline-flex rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-400"
          >
            Complete your profile
          </Link>
        </header>
      </div>
    )
  }

  const shoppingList = buildShoppingList(plan, days)
  const costSummary = estimateShoppingListCost(shoppingList)

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
      <header className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-7 sm:p-9">
        <Link
          href="/dashboard/nutrition"
          className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 transition hover:text-white"
        >
          <ArrowLeft className="size-3.5" />
          Back to Meal Plan
        </Link>

        <span className="mt-5 inline-grid size-14 place-items-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
          <ShoppingCart className="size-6" />
        </span>

        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
          Shopping List
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          {days} {days === 1 ? "Day" : "Days"}
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Estimated from your current meal plan — {shoppingList.itemCount} items across{" "}
          {shoppingList.groups.length} categories.
        </p>

        <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-2.5">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-400">
            Estimated market price
          </span>
          <span className="text-lg font-black text-white">
            {costSummary.totalSgd.toFixed(2)} SGD
          </span>
        </div>

        <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Shopping list duration">
          {SHOPPING_LIST_DAY_OPTIONS.map((option) => (
            <Link
              key={option}
              href={`/dashboard/nutrition/shopping-list?days=${option}`}
              aria-current={option === days ? "true" : undefined}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                option === days
                  ? "border-amber-400/40 bg-amber-400 text-black"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/20 hover:bg-white/10"
              }`}
            >
              {option} {option === 1 ? "Day" : "Days"}
            </Link>
          ))}
        </div>
      </header>

      <ShoppingListClient
        key={days}
        groups={shoppingList.groups}
        days={days}
        itemCostsSgd={Object.fromEntries(
          costSummary.items.map((item) => [item.foodId, item.costSgd]),
        )}
      />

      <p className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-xs leading-6 text-zinc-500">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
        Nutrition values are estimates and can vary by brand, preparation,
        cooking method and database record. Quantities reflect the weight
        basis already used in your meal plan (raw, cooked or as-served per
        ingredient) — see the Nutrition Data Sources note on your{" "}
        <Link href="/dashboard/nutrition" className="underline decoration-zinc-600 underline-offset-2 hover:text-zinc-300">
          Nutrition Plan
        </Link>
        .
      </p>
    </div>
  )
}
