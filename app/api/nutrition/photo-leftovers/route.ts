import { NextResponse } from "next/server"
import { z } from "zod"

import { compareLeftovers, isVisionConfigured } from "@/lib/ai/vision-client"
import { imageDataUrl, imageRejection } from "@/lib/nutrition/image-upload"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  before: imageDataUrl,
  after: imageDataUrl,
  components: z
    .array(z.object({ id: z.string().min(1).max(40), name: z.string().min(1).max(120), servedGrams: z.number().positive().max(5000) }))
    .min(1)
    .max(20)
    .refine((list) => new Set(list.map((c) => c.id)).size === list.length, { message: "Component ids must be unique." }),
})

/**
 * POST /api/nutrition/photo-leftovers — before/after plate comparison.
 * Returns a SUGGESTED eaten percentage per reviewed component (or null where the photos can't tell). It never
 * writes anything: the user adjusts the suggestions and confirms in the photo review, which logs through the
 * normal food-log path.
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
    const imageIssue = parsed.error.issues.some((issue) => issue.path[0] === "before" || issue.path[0] === "after")
    if (imageIssue) {
      const { error, status } = imageRejection(body, ["before", "after"])
      return NextResponse.json({ ok: false, error }, { status })
    }
    return NextResponse.json({ ok: false, error: "The reviewed meal couldn't be read. Nothing was changed." }, { status: 400 })
  }

  if (!isVisionConfigured()) {
    return NextResponse.json({ ok: true, result: { status: "unconfigured" } })
  }

  const { before, after, components } = parsed.data
  const comparison = await compareLeftovers(before, after, components)

  if (!comparison) {
    return NextResponse.json({ ok: true, result: { status: "error", message: "The after photo couldn't be compared right now." } })
  }
  if (!comparison.sameMeal) {
    return NextResponse.json({ ok: true, result: { status: "not_same_meal", reason: comparison.reason ?? "The after photo doesn't look like the same meal." } })
  }

  return NextResponse.json({
    ok: true,
    result: {
      status: "ok",
      components: comparison.components.map((c) => ({
        id: c.id,
        eatenPercent: c.remainingPercent === null ? null : 100 - c.remainingPercent,
        confidence: c.confidence,
        note: c.note ?? null,
      })),
    },
  })
}
