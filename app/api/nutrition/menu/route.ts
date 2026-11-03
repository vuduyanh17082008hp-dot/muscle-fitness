import { NextResponse } from "next/server"
import { z } from "zod"

import { isVisionConfigured, readMenuImage } from "@/lib/ai/vision-client"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { compareToTargets } from "@/lib/nutrition/food-log/totals"
import { imageDataUrl, imageRejection } from "@/lib/nutrition/image-upload"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { analyzeMenu, type MenuAthleteContext } from "@/lib/nutrition/menu-to-macro"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({ image: imageDataUrl })

/**
 * POST /api/nutrition/menu — Menu-to-Macro decision support.
 * The model reads the printed dish names; lib/nutrition/menu-to-macro.ts prices and ranks them against the
 * athlete's remaining day. This is a decision tool only: nothing is logged here, ever.
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

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    const { error, status } = imageRejection(body, ["image"])
    return NextResponse.json({ ok: false, error }, { status })
  }

  if (!isVisionConfigured()) {
    return NextResponse.json({ ok: true, result: { status: "unconfigured" } })
  }

  const [reading, context] = await Promise.all([readMenuImage(parsed.data.image), loadAthleteContext(supabase, user.id)])

  if (!reading) {
    return NextResponse.json({ ok: true, result: { status: "error", message: "The menu couldn't be read right now." } })
  }
  if (!reading.isMenu) {
    return NextResponse.json({ ok: true, result: { status: "not_menu" } })
  }
  if (reading.dishes.length === 0) {
    return NextResponse.json({ ok: true, result: { status: "unreadable" } })
  }

  return NextResponse.json({ ok: true, result: { status: "ok", analysis: analyzeMenu(reading, context) } })
}

/** Goal, remaining macros and allergies; anything that can't be read degrades to "unknown", never to a made-up value. */
async function loadAthleteContext(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<MenuAthleteContext> {
  try {
    const [foodLog, nutrition] = await Promise.all([loadFoodLogForDate(supabase, userId), loadNutritionContext(supabase, userId)])
    const target = nutrition.targets.complete
    const comparison = !foodLog.unavailable && target ? compareToTargets(foodLog.totals, target) : null
    const plan = nutrition.plan
    const allergiesKnown = Boolean(plan) && !nutrition.unavailable?.includes("preferences")
    return {
      goal: plan?.input.goal ?? null,
      remaining: comparison ? { calories: comparison.calories.remaining, protein: comparison.protein.remaining } : null,
      excludedTerms: plan ? [...plan.input.allergies, ...plan.input.excludedFoods] : [],
      allergiesKnown,
    }
  } catch (error) {
    console.error("[MENU] athlete context unavailable", error)
    return { goal: null, remaining: null, excludedTerms: [], allergiesKnown: false }
  }
}
