import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { loadFoodLogForDate, todayIso } from "@/lib/nutrition/food-log/load-food-log-context"
import { createFoodLog } from "@/lib/nutrition/food-log/mutations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const per100gSchema = z.object({
  calories: z.number().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(1000),
  fiber: z.number().min(0).max(500).nullable().optional(),
  sugar: z.number().min(0).max(500).nullable().optional(),
  sodiumMg: z.number().min(0).max(50000).nullable().optional(),
})

const createSchema = z.object({
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout"]),
  foodName: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(200).nullable().optional(),

  source: z.enum(["usda", "open-food-facts", "local", "user_provided", "ai_estimate"]),
  sourceId: z.string().trim().max(200).nullable().optional(),
  barcode: z.string().trim().max(32).nullable().optional(),

  per100g: per100gSchema,
  quantityGrams: z.number().positive().max(5000),
  servingName: z.string().trim().min(1).max(60).nullable().optional(),
  servingsConsumed: z.number().positive().max(1000).nullable().optional(),

  isEstimated: z.boolean().optional(),
  estimationConfidence: z.enum(["high", "medium", "low"]).nullable().optional(),
  estimationReason: z.string().trim().max(500).nullable().optional(),
  estimatedFrom: z.string().trim().max(200).nullable().optional(),

  logDate: z.string().regex(DATE_PATTERN).optional(),
})

/**
 * GET /api/nutrition/log?date=YYYY-MM-DD (defaults to today)
 * Returns the signed-in user's own logged foods and daily totals —
 * identity always comes from the authenticated session.
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const requestedDate = url.searchParams.get("date")
  const date = requestedDate && DATE_PATTERN.test(requestedDate) ? requestedDate : todayIso()

  const context = await loadFoodLogForDate(supabase, user.id, date)

  return NextResponse.json({ ok: true, ...context })
}

/**
 * POST /api/nutrition/log
 * Saves one confirmed food to today's (or a given date's) log. The
 * server always recomputes calories/protein/carbs/fat from
 * `per100g` × `quantityGrams` itself (lib/nutrition/food-log-calculator.ts)
 * — client-submitted totals are never trusted or persisted directly.
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid food log entry.", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const result = await createFoodLog(supabase, user.id, parsed.data)

  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, entry: result.data })
}
