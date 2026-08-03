import {
  NextResponse,
  type NextRequest,
} from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function POST() {
  const supabase = await createClient()

  const { error } =
    await supabase.auth.signOut()

  if (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 500,
      }
    )
  }

  return NextResponse.json({
    success: true,
  })
}

export async function GET(
  request: NextRequest
) {
  const supabase = await createClient()

  await supabase.auth.signOut()

  const loginUrl = new URL(
    "/login",
    request.url
  )

  loginUrl.searchParams.set(
    "message",
    "logged-out"
  )

  return NextResponse.redirect(loginUrl)
}