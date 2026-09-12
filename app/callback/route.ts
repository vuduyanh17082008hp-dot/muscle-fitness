import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { handleOAuthCallback } from "@/lib/auth/handle-oauth-callback"

function getSafeNextPath(value: string | null): string {
  if (!value) {
    return "/dashboard"
  }

  /*
   * Chỉ cho redirect nội bộ.
   * Ngăn URL như //malicious-site.com.
   */
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard"
  }

  return value
}

/**
 * Kept only in case this URL is still registered as a Supabase Auth
 * redirect URL externally — every internal link uses /auth/callback
 * instead (see app/auth/callback/route.ts). Both now delegate to the
 * same handleOAuthCallback() so they can never drift again.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)

  const code = requestUrl.searchParams.get("code")
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"))

  if (!code) {
    const loginUrl = new URL("/login", requestUrl.origin)
    loginUrl.searchParams.set("error", "Authentication code was not found.")
    return NextResponse.redirect(loginUrl)
  }

  const supabase = await createClient()
  const result = await handleOAuthCallback(supabase, code)

  if (!result.success) {
    const loginUrl = new URL("/login", requestUrl.origin)
    loginUrl.searchParams.set("error", result.errorMessage)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.redirect(new URL(nextPath, requestUrl.origin))
}
