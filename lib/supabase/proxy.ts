import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { requireSupabasePublicEnv } from "@/lib/supabase/env"

const PROTECTED_ROUTES = [
  "/dashboard",
  "/account",
  "/onboarding",
  "/today",
  "/workouts",
  "/nutrition",
  "/progress",
  "/check-in",
  "/ai-coach",
  "/messages",
  "/calendar",
  "/settings",
  "/coach",
  "/admin",
  "/billing",
  "/support",
  "/feedback",
  "/reminders",
  "/notifications",
]

/*
 * Chỉ những route này mới redirect user đã đăng nhập
 * về dashboard.
 *
 * Tuyệt đối không thêm:
 * /account
 * /profile
 * /account/edit
 */
const AUTH_PAGES = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
])

function isRouteMatch(
  pathname: string,
  route: string
): boolean {
  return (
    pathname === route ||
    pathname.startsWith(`${route}/`)
  )
}

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) =>
    isRouteMatch(pathname, route)
  )
}

function copyAuthCookies(
  source: NextResponse,
  target: NextResponse
): NextResponse {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie)
  })

  return target
}

function getSupabaseConfig() {
  const { url, publicKey } = requireSupabasePublicEnv()

  return {
    url,
    key: publicKey,
  }
}

export async function updateSession(
  request: NextRequest
): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const { url, key } = getSupabaseConfig()

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },

        setAll(cookiesToSet, headersToSet) {
          /*
           * Cho Server Components trong request hiện tại
           * nhìn thấy cookie mới.
           */
          cookiesToSet.forEach(
            ({ name, value }) => {
              request.cookies.set(name, value)
            }
          )

          supabaseResponse = NextResponse.next({
            request,
          })

          /*
           * Gửi cookie mới về browser.
           */
          cookiesToSet.forEach(
            ({ name, value, options }) => {
              supabaseResponse.cookies.set(
                name,
                value,
                options
              )
            }
          )

          /*
           * Giữ headers được Supabase trả về.
           */
          Object.entries(headersToSet).forEach(
            ([name, value]) => {
              supabaseResponse.headers.set(
                name,
                value
              )
            }
          )
        },
      },
    }
  )

  /*
   * Không đặt logic khác giữa createServerClient
   * và getClaims().
   */
  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims()

  const pathname = request.nextUrl.pathname

  const userId =
    !claimsError &&
    typeof claimsData?.claims?.sub === "string"
      ? claimsData.claims.sub
      : null

  const isAuthenticated = Boolean(userId)

  /*
   * User chưa đăng nhập nhưng truy cập private route.
   */
  if (
    !isAuthenticated &&
    isProtectedRoute(pathname)
  ) {
    const loginUrl = request.nextUrl.clone()

    loginUrl.pathname = "/login"
    loginUrl.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search}`
    )

    const redirectResponse =
      NextResponse.redirect(loginUrl)

    return copyAuthCookies(
      supabaseResponse,
      redirectResponse
    )
  }

  /*
   * Chỉ redirect khi user đã đăng nhập
   * nhưng truy cập đúng trang login/register.
   *
   * Không dùng startsWith("/account").
   */
  if (
    isAuthenticated &&
    AUTH_PAGES.has(pathname)
  ) {
    const dashboardUrl =
      request.nextUrl.clone()

    dashboardUrl.pathname = "/dashboard"
    dashboardUrl.search = ""

    const redirectResponse =
      NextResponse.redirect(dashboardUrl)

    return copyAuthCookies(
      supabaseResponse,
      redirectResponse
    )
  }

  return supabaseResponse
}