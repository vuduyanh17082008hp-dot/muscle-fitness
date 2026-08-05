import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const requestUrl = new URL(request.url)
  const supabase = await createClient()

  const { error } = await supabase.auth.signOut({
    scope: "local",
  })

  const loginUrl = new URL(
    "/login",
    requestUrl.origin
  )

  if (error) {
    loginUrl.searchParams.set(
      "error",
      error.message
    )
  } else {
    loginUrl.searchParams.set(
      "message",
      "You have been signed out."
    )
  }

  return NextResponse.redirect(loginUrl, {
    status: 303,
  })
}
