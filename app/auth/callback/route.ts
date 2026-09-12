import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { handleOAuthCallback } from "@/lib/auth/handle-oauth-callback";

function getSafeRedirect(value: string | null): string {
  if (!value) {
    return "/dashboard";
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

function redirectToLoginWithError(request: NextRequest, message: string) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", message);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);

  const code = requestUrl.searchParams.get("code");

  const oauthError =
    requestUrl.searchParams.get("error_description") ??
    requestUrl.searchParams.get("error");

  const next = getSafeRedirect(requestUrl.searchParams.get("next"));

  if (oauthError) {
    return redirectToLoginWithError(request, oauthError);
  }

  if (!code) {
    return redirectToLoginWithError(request, "Authentication code was not received.");
  }

  // Canonical server client (env validation, cookie handling) rather
  // than a second hand-rolled createServerClient call — this route
  // used to construct its own, which is exactly the kind of
  // duplicate Supabase client the rest of the app avoids.
  const supabase = await createClient();

  const result = await handleOAuthCallback(supabase, code);

  if (!result.success) {
    return redirectToLoginWithError(request, result.errorMessage);
  }

  return NextResponse.redirect(new URL(next, request.url));
}
