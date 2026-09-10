import { NextResponse } from "next/server"

import { searchFood, type FoodSearchCategory } from "@/lib/nutrition/food-data"

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

  const result = await searchFood(query, category)

  return NextResponse.json({
    ok: true,
    query,
    category,
    ...result,
  })
}
