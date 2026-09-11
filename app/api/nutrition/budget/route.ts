import { NextResponse } from "next/server"

import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { buildBudgetPlan } from "@/lib/nutrition/budget"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  weeklyBudget: z.number().min(0).max(1_000_000).nullable().optional(),
  persist: z.boolean().optional(),
  manualSubstitutions: z
    .array(z.object({ from: z.string().min(1), to: z.string().min(1) }))
    .max(10)
    .optional(),
})

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { weeklyBudget, persist, manualSubstitutions } = parsed.data

  if (persist) {
    const { error } = await supabase.from("user_preferences").upsert(
      { user_id: user.id, weekly_food_budget: weeklyBudget ?? null },
      { onConflict: "user_id" },
    )

    if (error) {
      return NextResponse.json(
        { error: `Unable to save budget: ${error.message}` },
        { status: 500 },
      )
    }
  }

  const context = await loadNutritionContext(supabase, user.id)

  if (!context.plan) {
    return NextResponse.json(
      {
        error:
          "A nutrition plan is required before a budget can be calculated. Complete your profile first.",
        missingRequiredFields: context.missingRequiredFields,
      },
      { status: 422 },
    )
  }

  const effectiveBudget =
    weeklyBudget !== undefined ? weeklyBudget : context.weeklyFoodBudgetSgd

  const budgetPlan = buildBudgetPlan(context.plan, effectiveBudget, {
    manualSubstitutions,
  })

  return NextResponse.json({ success: true, budgetPlan })
}
