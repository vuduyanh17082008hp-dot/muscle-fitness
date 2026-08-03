import { NextResponse, type NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  await supabase.auth.signOut()

  const loginUrl = new URL("/login", request.url)

  loginUrl.searchParams.set(
    "message",
    "email-confirmed"
  )

  return NextResponse.redirect(loginUrl)
}