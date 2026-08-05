import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type FoodItem = {
  id: string
  name: string
  servingSize: number
  servingUnit: "g" | "ml" | "item"
  calories: number
  protein: number
  carbohydrates: number
  fat: number
  fiber: number
}

type FoodSearchBody = {
  query?: unknown
  limit?: unknown
}

const foods: FoodItem[] = [
  {
    id: "chicken-breast-cooked",
    name: "Chicken breast, cooked",
    servingSize: 100,
    servingUnit: "g",
    calories: 165,
    protein: 31,
    carbohydrates: 0,
    fat: 3.6,
    fiber: 0,
  },
  {
    id: "lean-beef-cooked",
    name: "Lean beef, cooked",
    servingSize: 100,
    servingUnit: "g",
    calories: 217,
    protein: 26,
    carbohydrates: 0,
    fat: 12,
    fiber: 0,
  },
  {
    id: "salmon-cooked",
    name: "Salmon, cooked",
    servingSize: 100,
    servingUnit: "g",
    calories: 208,
    protein: 20,
    carbohydrates: 0,
    fat: 13,
    fiber: 0,
  },
  {
    id: "egg-whole",
    name: "Whole egg",
    servingSize: 1,
    servingUnit: "item",
    calories: 72,
    protein: 6.3,
    carbohydrates: 0.4,
    fat: 4.8,
    fiber: 0,
  },
  {
    id: "white-rice-cooked",
    name: "White rice, cooked",
    servingSize: 100,
    servingUnit: "g",
    calories: 130,
    protein: 2.7,
    carbohydrates: 28.2,
    fat: 0.3,
    fiber: 0.4,
  },
  {
    id: "oats-dry",
    name: "Oats, dry",
    servingSize: 100,
    servingUnit: "g",
    calories: 389,
    protein: 16.9,
    carbohydrates: 66.3,
    fat: 6.9,
    fiber: 10.6,
  },
  {
    id: "potato-boiled",
    name: "Potato, boiled",
    servingSize: 100,
    servingUnit: "g",
    calories: 87,
    protein: 1.9,
    carbohydrates: 20.1,
    fat: 0.1,
    fiber: 1.8,
  },
  {
    id: "banana",
    name: "Banana",
    servingSize: 100,
    servingUnit: "g",
    calories: 89,
    protein: 1.1,
    carbohydrates: 22.8,
    fat: 0.3,
    fiber: 2.6,
  },
  {
    id: "blueberries",
    name: "Blueberries",
    servingSize: 100,
    servingUnit: "g",
    calories: 57,
    protein: 0.7,
    carbohydrates: 14.5,
    fat: 0.3,
    fiber: 2.4,
  },
  {
    id: "greek-yogurt-non-fat",
    name: "Greek yogurt, non-fat",
    servingSize: 100,
    servingUnit: "g",
    calories: 59,
    protein: 10.3,
    carbohydrates: 3.6,
    fat: 0.4,
    fiber: 0,
  },
  {
    id: "broccoli-cooked",
    name: "Broccoli, cooked",
    servingSize: 100,
    servingUnit: "g",
    calories: 35,
    protein: 2.4,
    carbohydrates: 7.2,
    fat: 0.4,
    fiber: 3.3,
  },
  {
    id: "carrot",
    name: "Carrot",
    servingSize: 100,
    servingUnit: "g",
    calories: 41,
    protein: 0.9,
    carbohydrates: 9.6,
    fat: 0.2,
    fiber: 2.8,
  },
]

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
}

function normalizeLimit(
  value: unknown,
): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return Math.min(
      Math.max(Math.trunc(value), 1),
      50,
    )
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    const parsed = Number(value)

    if (Number.isFinite(parsed)) {
      return Math.min(
        Math.max(Math.trunc(parsed), 1),
        50,
      )
    }
  }

  return 20
}

function searchFoods(
  query: string,
  limit: number,
): FoodItem[] {
  const normalizedQuery = query
    .trim()
    .toLowerCase()

  if (!normalizedQuery) {
    return foods.slice(0, limit)
  }

  return foods
    .filter((food) => {
      return (
        food.name
          .toLowerCase()
          .includes(normalizedQuery) ||
        food.id
          .toLowerCase()
          .includes(normalizedQuery)
      )
    })
    .slice(0, limit)
}

export async function GET(
  request: Request,
) {
  const url = new URL(request.url)

  const query =
    url.searchParams.get("q") ??
    url.searchParams.get("query") ??
    ""

  const limit = normalizeLimit(
    url.searchParams.get("limit"),
  )

  const results = searchFoods(
    query,
    limit,
  )

  return NextResponse.json({
    ok: true,
    query,
    count: results.length,
    foods: results,
    source: "muscle-fitness-test-database",
  })
}

export async function POST(
  request: Request,
) {
  try {
    const body: unknown =
      await request.json()

    if (!isRecord(body)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Request body must be a JSON object.",
        },
        {
          status: 400,
        },
      )
    }

    const requestBody =
      body as FoodSearchBody

    const query =
      typeof requestBody.query ===
      "string"
        ? requestBody.query
        : ""

    const limit = normalizeLimit(
      requestBody.limit,
    )

    const results = searchFoods(
      query,
      limit,
    )

    return NextResponse.json({
      ok: true,
      query,
      count: results.length,
      foods: results,
      source:
        "muscle-fitness-test-database",
    })
  } catch (error) {
    const details =
      error instanceof Error
        ? error.message
        : "Unknown request error."

    return NextResponse.json(
      {
        ok: false,
        error:
          "Unable to process the food search request.",
        details:
          process.env.NODE_ENV ===
          "development"
            ? details
            : undefined,
      },
      {
        status: 400,
      },
    )
  }
}