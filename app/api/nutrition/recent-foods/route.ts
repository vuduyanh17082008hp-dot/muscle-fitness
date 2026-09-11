import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { loadFrequentFoods, loadRecentFoods } from "@/lib/nutrition/food-log/history"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/nutrition/recent-foods — this user's recent + frequent foods, computed purely from their own logs. */
export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const [recent, frequent] = await Promise.all([
    loadRecentFoods(supabase, user.id),
    loadFrequentFoods(supabase, user.id),
  ])

  return NextResponse.json({ ok: true, recent, frequent })
}
