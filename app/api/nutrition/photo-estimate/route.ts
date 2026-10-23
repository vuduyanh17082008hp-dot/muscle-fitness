import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { estimateMealFromPhoto } from "@/lib/nutrition/photo-estimate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// The panel re-encodes photos to a <=1280px JPEG (~0.3 MB), so ~3 MB of base64 is generous and
// stays under the 4.5 MB serverless request-body limit.
const MAX_IMAGE_LENGTH = 4_000_000
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/

const requestSchema = z.object({
  image: z
    .string()
    .min(1)
    .max(MAX_IMAGE_LENGTH)
    .refine((value) => IMAGE_DATA_URL.test(value), {
      message: "Image must be a JPEG, PNG or WebP data URL.",
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
    const tooLarge = typeof (body as { image?: unknown })?.image === "string" && (body as { image: string }).image.length > MAX_IMAGE_LENGTH
    return NextResponse.json(
      { ok: false, error: tooLarge ? "That image is too large. Try a smaller photo." : "Unsupported image. Use a JPEG, PNG or WebP photo." },
      { status: tooLarge ? 413 : 400 },
    )
  }

  const result = await estimateMealFromPhoto(parsed.data.image)

  return NextResponse.json({ ok: true, result })
}
