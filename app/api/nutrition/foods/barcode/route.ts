import { NextResponse } from "next/server"

import { lookupBarcode } from "@/lib/nutrition/food-data"
import { normalizeBarcode } from "@/lib/nutrition/barcode"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/nutrition/foods/barcode?code=737628064502
 *
 * Looks a single product up on Open Food Facts by barcode. Returns
 * `{ ok: true, food: null }` (not an error) when the barcode is
 * simply not found, since that is an expected, non-exceptional
 * outcome. Accepts EAN-13/EAN-8/UPC-A/UPC-E — normalization (and
 * UPC-E expansion) happens in lib/nutrition/barcode.ts so the client
 * and this route can never disagree on what a valid barcode is.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const rawCode = (url.searchParams.get("code") ?? "").trim()

  const normalized = normalizeBarcode(rawCode)

  if (!normalized) {
    return NextResponse.json(
      { ok: false, error: "Provide a valid EAN-13/EAN-8/UPC-A/UPC-E barcode with ?code=" },
      { status: 400 },
    )
  }

  const food = await lookupBarcode(normalized.code)

  return NextResponse.json({ ok: true, code: normalized.code, format: normalized.format, food })
}
