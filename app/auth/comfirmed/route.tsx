import { NextResponse, type NextRequest } from "next/server"

/**
 * Typo alias for `/auth/confirm`. Older email templates / docs linked
 * here; the previous handler signed the user OUT and claimed success.
 * Forward to the real OTP verification route with the query string
 * intact so confirmation still works.
 */
export async function GET(request: NextRequest) {
  const confirmUrl = new URL("/auth/confirm", request.url)
  confirmUrl.search = request.nextUrl.search
  return NextResponse.redirect(confirmUrl)
}
