import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { deleteFoodLog, updateFoodLogQuantity } from "@/lib/nutrition/food-log/mutations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const updateSchema = z.object({
  quantityGrams: z.number().positive().max(5000),
  servingName: z.string().trim().min(1).max(60).nullable().optional(),
  servingsConsumed: z.number().positive().max(1000).nullable().optional(),
})

type RouteParams = { params: Promise<{ id: string }> }

/**
 * PATCH /api/nutrition/log/:id — recalculates macros for a new
 * quantity. PATCH is intentionally the only supported edit (grams
 * only) — changing the underlying food should be a delete + re-add
 * so provenance/source data never drifts from what was actually
 * looked up.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params

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

  const parsed = updateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid update.", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const result = await updateFoodLogQuantity(supabase, user.id, {
    id,
    quantityGrams: parsed.data.quantityGrams,
    servingName: parsed.data.servingName,
    servingsConsumed: parsed.data.servingsConsumed,
  })

  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, entry: result.data })
}

/** DELETE /api/nutrition/log/:id */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const result = await deleteFoodLog(supabase, user.id, id)

  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: result.data.id })
}
