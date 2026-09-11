import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { loadLastPortionForFood } from "@/lib/nutrition/food-log/history"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/nutrition/last-portion?foodIdentity=barcode:123 — the user's most recently used portion for this food, or null. */
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

  const lastPortion = await loadLastPortionForFood(supabase, user.id, foodIdentity)

  return NextResponse.json({ ok: true, lastPortion })
}
