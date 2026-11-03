import { NextResponse } from "next/server"

import { MIN_QUERY_LENGTH, searchFood, type FoodSearchCategory } from "@/lib/nutrition/food-data"
import { guardFoodLookup } from "@/lib/nutrition/food-data/lookup-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function parseCategory(value: string | null): FoodSearchCategory {
  if (value === "raw" || value === "packaged") {
    return value
  }

  return "any"
}

/**
 * GET /api/nutrition/foods/search?q=chicken%20breast&type=raw
 *
 * Returns normalized food results only — never proxies an arbitrary
 * URL, and never exposes the USDA API key or Open Food Facts
 * User-Agent to the caller.
 */
export async function GET(request: Request) {
  // QA-05: signed-in callers only, at a bounded rate — these spend the server's provider quota.
  const stop = await guardFoodLookup()
  if (stop) return stop

  const url = new URL(request.url)

  const query = (url.searchParams.get("q") ?? url.searchParams.get("query") ?? "").trim()
  const category = parseCategory(url.searchParams.get("type"))

  if (!query) {
    return NextResponse.json(
      { ok: false, error: "Provide a search query with ?q=" },
      { status: 400 },
    )
  }

  if (query.length > 100) {
    return NextResponse.json(
      { ok: false, error: "Query is too long." },
      { status: 400 },
    )
  }

  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json(
      { ok: false, status: "invalid_input", error: `Type at least ${MIN_QUERY_LENGTH} characters.` },
      { status: 400 },
    )
  }

  // `request` stays in scope for the whole await, so its abort signal stays live (see H0 WP1 Request.signal note).
  const result = await searchFood(query, category, { signal: request.signal })

  return NextResponse.json({
    ok: true,
    query,
    category,
    ...result,
  })
}
