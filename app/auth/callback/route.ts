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
    "/login",
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
      "Authentication code was not received.",
    );
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  const supabaseKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ?.trim() ||
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY
      ?.trim();

  if (!supabaseUrl || !supabaseKey) {
    return redirectToLoginWithError(
      request,
      "Missing Supabase configuration in .env.local.",
    );
  }

  const response = NextResponse.redirect(
    new URL(next, request.url),
  );

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
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
