import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSafeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";
import { handleOAuthCallback } from "@/lib/auth/handle-oauth-callback";


function redirectToLoginWithError(request: NextRequest, message: string) {
  // A failed recovery link (expired, reused, opened in another browser)
  // goes back to the form that can send a new one.
  if (getSafeNext(request.nextUrl.searchParams.get("next")) === "/reset-password") {
    return NextResponse.redirect(
      new URL("/forgot-password?error=invalid-reset-link", request.url),
    );
  }

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

  const next = getSafeNext(requestUrl.searchParams.get("next"));

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
