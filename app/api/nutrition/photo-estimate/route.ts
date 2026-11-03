import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { estimateMealFromPhoto } from "@/lib/nutrition/photo-estimate"
import { imageDataUrl, imageRejection } from "@/lib/nutrition/image-upload"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({ image: imageDataUrl })

/**
 * POST /api/nutrition/photo-estimate
 * Requires auth (this is a logged-in tracking feature, not a public
 * endpoint) and a configured vision model — see lib/ai/vision-client.ts.
 * Never invents nutrition values; only grounds AI-identified foods in
 * the existing USDA/Open Food Facts cascade.
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

  const result = await estimateMealFromPhoto(parsed.data.image)

  return NextResponse.json({ ok: true, result })
}
