import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { estimateMealFromPhoto } from "@/lib/nutrition/photo-estimate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ~6MB base64 ceiling keeps this well under typical serverless body limits.
const MAX_IMAGE_LENGTH = 8_000_000

const requestSchema = z.object({
  image: z
    .string()
    .min(1)
    .max(MAX_IMAGE_LENGTH)
    .refine((value) => value.startsWith("data:image/"), {
      message: "Image must be a data URL (data:image/...).",
    }),
})

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
    return NextResponse.json(
      { ok: false, error: "Invalid image payload.", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const result = await estimateMealFromPhoto(parsed.data.image)

  return NextResponse.json({ ok: true, result })
}
