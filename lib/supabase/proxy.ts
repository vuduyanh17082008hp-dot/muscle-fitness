import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

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

function getSupabaseConfig(): {
  url: string
  key: string
} | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return null
  }

  return {
    url,
    key,
  }
}

let loggedProxyFailure = false

/*
 * Proxy chạy trên MỌI route (trừ static asset). Nếu nó throw thì
 * toàn bộ site trả về "Internal Server Error", kể cả trang public.
 *
 * Vì vậy proxy không bao giờ được throw. Khi Supabase thiếu config
 * hoặc gọi lỗi:
 * - route private: redirect về /login (fail closed, giữ an toàn)
 * - route public: cho request đi qua (fail open, trang vẫn hiển thị)
 */
function logProxyFailureOnce(reason: string): void {
  if (loggedProxyFailure) {
    return
  }

  loggedProxyFailure = true

  console.error(
    `[muscle-fitness] Auth proxy disabled: ${reason} ` +
      "Public pages still render; protected routes redirect to /login. " +
      "Configure NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) " +
      "in your deployment environment, then redeploy."
  )
}

function handleProxyFailure(
  request: NextRequest,
  reason: string
): NextResponse {
  logProxyFailureOnce(reason)

  const pathname = request.nextUrl.pathname

  if (isProtectedRoute(pathname)) {
    const loginUrl = request.nextUrl.clone()

    loginUrl.pathname = "/login"
    loginUrl.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search}`
    )

    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next({ request })
}

export async function updateSession(
  request: NextRequest
): Promise<NextResponse> {
  try {
    return await runSessionProxy(request)
  } catch (error) {
    return handleProxyFailure(
      request,
      error instanceof Error
        ? error.message
        : "unexpected proxy error."
    )
  }
}

async function runSessionProxy(
  request: NextRequest
): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const config = getSupabaseConfig()

  if (!config) {
    return handleProxyFailure(
      request,
      "Supabase public environment variables are not configured."
    )
  }

  const { url, key } = config

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