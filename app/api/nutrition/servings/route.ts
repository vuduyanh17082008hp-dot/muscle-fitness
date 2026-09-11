import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { loadServingsForFood, saveUserFoodServing } from "@/lib/nutrition/user-servings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const saveSchema = z.object({
  foodIdentity: z.string().trim().min(1).max(300),
  foodName: z.string().trim().min(1).max(200),
  servingName: z.string().trim().min(1).max(60),
  servingGrams: z.number().positive().max(5000),
})

/** GET /api/nutrition/servings?foodIdentity=barcode:123 — this user's saved serving presets for one food. */
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const foodIdentity = (url.searchParams.get("foodIdentity") ?? "").trim()

  if (!foodIdentity) {
    return NextResponse.json({ ok: false, error: "Provide ?foodIdentity=" }, { status: 400 })
  }

  const servings = await loadServingsForFood(supabase, user.id, foodIdentity)

  return NextResponse.json({ ok: true, servings })
}

/**
 * POST /api/nutrition/servings — saves a personal serving definition
 * ("1 scoop = 30 g"). Never touches the shared food database record;
 * this is stored per-user only (spec: "USER-SAVED SERVINGS").
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

  const parsed = saveSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid serving definition.", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const result = await saveUserFoodServing(supabase, user.id, parsed.data)

  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, serving: result.data })
}
