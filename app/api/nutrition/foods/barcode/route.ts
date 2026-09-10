import { NextResponse } from "next/server"

import { lookupBarcode } from "@/lib/nutrition/food-data"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BARCODE_PATTERN = /^[0-9]{6,14}$/

/**
 * GET /api/nutrition/foods/barcode?code=737628064502
 *
 * Looks a single product up on Open Food Facts by barcode. Returns
 * `{ ok: true, food: null }` (not an error) when the barcode is
 * simply not found, since that is an expected, non-exceptional
 * outcome.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = (url.searchParams.get("code") ?? "").trim()

  if (!BARCODE_PATTERN.test(code)) {
    return NextResponse.json(
      { ok: false, error: "Provide a numeric barcode with ?code=" },
      { status: 400 },
    )
  }

  const food = await lookupBarcode(code)

  return NextResponse.json({ ok: true, code, food })
}
