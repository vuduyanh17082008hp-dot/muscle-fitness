import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function gone() {
  return NextResponse.json(
    {
      ok: false,
      code: "ENDPOINT_DEPRECATED",
      error: "This food endpoint has been retired. Use /api/nutrition/foods/search.",
    },
    {
      status: 410,
      headers: {
        Link: '</api/nutrition/foods/search>; rel="successor-version"',
      },
    },
  )
}

export const GET = gone
export const POST = gone