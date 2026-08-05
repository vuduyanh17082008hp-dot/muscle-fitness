import { createServerClient } from "@supabase/ssr";
import {
  NextRequest,
  NextResponse,
} from "next/server";

function getSafeRedirect(
  value: string | null,
): string {
  if (!value) {
    return "/dashboard";
  }

  if (
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/dashboard";
  }

  return value;
}

function redirectToLoginWithError(
  request: NextRequest,
  message: string,
) {
  const loginUrl = new URL(
    "/auth/login",
    request.url,
  );

  loginUrl.searchParams.set(
    "error",
    message,
  );

  return NextResponse.redirect(loginUrl);
}

export async function GET(
  request: NextRequest,
) {
  const requestUrl = new URL(request.url);

  const code =
    requestUrl.searchParams.get("code");

  const oauthError =
    requestUrl.searchParams.get(
      "error_description",
    ) ??
    requestUrl.searchParams.get("error");

  const next = getSafeRedirect(
    requestUrl.searchParams.get("next"),
  );

  if (oauthError) {
    return redirectToLoginWithError(
      request,
      oauthError,
    );
  }

  if (!code) {
    return redirectToLoginWithError(
      request,
      "Không nhận được mã xác thực từ Google.",
    );
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return redirectToLoginWithError(
      request,
      "Thiếu cấu hình Supabase trong .env.local.",
    );
  }

  const response = NextResponse.redirect(
    new URL(next, request.url),
  );

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(
            ({
              name,
              value,
              options,
            }) => {
              response.cookies.set(
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

  const { error } =
    await supabase.auth.exchangeCodeForSession(
      code,
    );

  if (error) {
    console.error(
      "OAuth callback error:",
      error,
    );

    return redirectToLoginWithError(
      request,
      error.message,
    );
  }

  return response;
}