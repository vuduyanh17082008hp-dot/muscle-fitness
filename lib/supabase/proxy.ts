import {
  createServerClient,
} from "@supabase/ssr";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

/* =========================================================
   ROUTES
========================================================= */

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
] as const;

const AUTH_PAGES =
  new Set([
    "/login",
    "/register",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ]);

/* =========================================================
   ROUTE HELPERS
========================================================= */

function isRouteMatch(
  pathname: string,
  route: string,
): boolean {
  return (
    pathname === route ||
    pathname.startsWith(
      `${route}/`,
    )
  );
}

function isProtectedRoute(
  pathname: string,
): boolean {
  return PROTECTED_ROUTES.some(
    (route) =>
      isRouteMatch(
        pathname,
        route,
      ),
  );
}

/* =========================================================
   SUPABASE CONFIG
========================================================= */

type SupabaseConfig = {
  url: string;
  key: string;
};

function getSupabaseConfig():
  SupabaseConfig | null {
  const url =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL
      ?.trim();

  const key =
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ?.trim() ??
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY
      ?.trim();

  if (
    !url ||
    !key
  ) {
    return null;
  }

  return {
    url,
    key,
  };
}

/* =========================================================
   COOKIE COPY
========================================================= */

function copyAuthCookies(
  source: NextResponse,
  target: NextResponse,
): NextResponse {
  source.cookies
    .getAll()
    .forEach(
      (cookie) => {
        target.cookies.set(
          cookie,
        );
      },
    );

  return target;
}

/* =========================================================
   UPDATE SESSION
========================================================= */

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  const pathname =
    request.nextUrl.pathname;

  const config =
    getSupabaseConfig();

  /* =======================================================
     IMPORTANT

     Do not crash the entire public website if Supabase
     environment variables are temporarily unavailable.

     Public routes can continue rendering.

     Protected routes are redirected to login.
  ======================================================= */

  if (!config) {
    console.error(
      [
        "[SUPABASE CONFIG ERROR]",
        "Missing NEXT_PUBLIC_SUPABASE_URL",
        "or Supabase publishable / anon key.",
      ].join(" "),
    );

    if (
      isProtectedRoute(
        pathname,
      )
    ) {
      const loginUrl =
        request.nextUrl.clone();

      loginUrl.pathname =
        "/login";

      loginUrl.searchParams.set(
        "next",
        `${pathname}${request.nextUrl.search}`,
      );

      return NextResponse.redirect(
        loginUrl,
      );
    }

    return NextResponse.next({
      request,
    });
  }

  /* =======================================================
     INITIAL RESPONSE
  ======================================================= */

  let supabaseResponse =
    NextResponse.next({
      request,
    });

  /* =======================================================
     SUPABASE CLIENT
  ======================================================= */

  const supabase =
    createServerClient(
      config.url,
      config.key,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },

          setAll(
            cookiesToSet,
          ) {
            /*
             * Update request cookies so Server Components
             * see refreshed auth state during this request.
             */
            cookiesToSet.forEach(
              ({
                name,
                value,
              }) => {
                request.cookies.set(
                  name,
                  value,
                );
              },
            );

            /*
             * Recreate response with the updated request.
             */
            supabaseResponse =
              NextResponse.next({
                request,
              });

            /*
             * Send refreshed cookies back to the browser.
             */
            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                supabaseResponse.cookies.set(
                  name,
                  value,
                  options,
                );
              },
            );
          },
        },
      },
    );

  /* =======================================================
     AUTH CLAIMS
  ======================================================= */

  let userId:
    string | null =
      null;

  try {
    const {
      data,
      error,
    } =
      await supabase.auth.getClaims();

    if (
      !error &&
      typeof data?.claims?.sub ===
        "string"
    ) {
      userId =
        data.claims.sub;
    }
  } catch (
    error
  ) {
    /*
     * An auth refresh failure should not destroy public
     * pages.
     */
    console.error(
      "[SUPABASE AUTH ERROR]",
      error,
    );
  }

  const isAuthenticated =
    Boolean(userId);

  /* =======================================================
     PRIVATE ROUTE
  ======================================================= */

  if (
    !isAuthenticated &&
    isProtectedRoute(
      pathname,
    )
  ) {
    const loginUrl =
      request.nextUrl.clone();

    loginUrl.pathname =
      "/login";

    loginUrl.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search}`,
    );

    const redirectResponse =
      NextResponse.redirect(
        loginUrl,
      );

    return copyAuthCookies(
      supabaseResponse,
      redirectResponse,
    );
  }

  /* =======================================================
     AUTH PAGE

     Already authenticated users should not be sent back
     through login/register.
  ======================================================= */

  if (
    isAuthenticated &&
    AUTH_PAGES.has(
      pathname,
    )
  ) {
    const dashboardUrl =
      request.nextUrl.clone();

    dashboardUrl.pathname =
      "/dashboard";

    dashboardUrl.search =
      "";

    const redirectResponse =
      NextResponse.redirect(
        dashboardUrl,
      );

    return copyAuthCookies(
      supabaseResponse,
      redirectResponse,
    );
  }

  return supabaseResponse;
}