import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)

  const code = requestUrl.searchParams.get("code")
  const error = requestUrl.searchParams.get("error")
  const errorDescription =
    requestUrl.searchParams.get("error_description")

  let next = requestUrl.searchParams.get("next") ?? "/dashboard"

  // Ngăn open redirect.
  if (!next.startsWith("/")) {
    next = "/dashboard"
  }

  if (error) {
    const loginUrl = new URL("/login", requestUrl.origin)

    loginUrl.searchParams.set(
      "error",
      errorDescription ?? error
    )

    return NextResponse.redirect(loginUrl)
  }

  if (!code) {
    const loginUrl = new URL("/login", requestUrl.origin)

    loginUrl.searchParams.set(
      "error",
      "Google không trả về authorization code."
    )

    return NextResponse.redirect(loginUrl)
  }

  const supabase = await createClient()

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    console.error(
      "OAuth code exchange failed:",
      exchangeError
    )

    const loginUrl = new URL("/login", requestUrl.origin)

    loginUrl.searchParams.set(
      "error",
      "Không thể hoàn tất đăng nhập Google."
    )

    return NextResponse.redirect(loginUrl)
  }

  const forwardedHost =
    request.headers.get("x-forwarded-host")

  const forwardedProtocol =
    request.headers.get("x-forwarded-proto") ?? "https"

  if (
    process.env.NODE_ENV === "production" &&
    forwardedHost
  ) {
    return NextResponse.redirect(
      `${forwardedProtocol}://${forwardedHost}${next}`
    )
  }

  return NextResponse.redirect(
    new URL(next, requestUrl.origin)
  )
}