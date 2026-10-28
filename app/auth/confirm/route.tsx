import type { EmailOtpType } from "@supabase/supabase-js"
import {
  NextResponse,
  type NextRequest,
} from "next/server"

import { getSupabaseEnvironment } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  request: NextRequest
) {
  const tokenHash =
    request.nextUrl.searchParams.get(
      "token_hash"
    )

  const rawType =
    request.nextUrl.searchParams.get("type")

  if (
    !tokenHash ||
    (rawType !== "email" &&
      rawType !== "recovery")
  ) {
    return redirectToError(
      request,
      "invalid-confirmation-link"
    )
  }

  /*
   * A token_hash recovery link (custom email template) is handed back to
   * GoTrue's verify endpoint so it finishes as a PKCE exchange in
   * /auth/callback: verifyOtp here would record amr "otp", which cannot
   * be told apart from an OTP login, and /reset-password requires
   * "recovery".
   */
  if (rawType === "recovery") {
    const verifyUrl = new URL(
      "/auth/v1/verify",
      getSupabaseEnvironment().url
    )

    verifyUrl.searchParams.set("token", tokenHash)
    verifyUrl.searchParams.set("type", "recovery")
    verifyUrl.searchParams.set(
      "redirect_to",
      new URL(
        "/auth/callback?next=/reset-password",
        request.url
      ).toString()
    )

    return NextResponse.redirect(verifyUrl)
  }

  const supabase = await createClient()

  const { error } =
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType as EmailOtpType,
    })

  if (error) {
    return redirectToError(
      request,
      "expired-confirmation-link"
    )
  }

  /*
   * Flow mong muốn:
   * Confirm email → Login thủ công.
   */
  await supabase.auth.signOut()

  const loginUrl = new URL(
    "/login",
    request.url
  )

  loginUrl.searchParams.set(
    "message",
    "email-confirmed"
  )

  return NextResponse.redirect(loginUrl)
}

function redirectToError(
  request: NextRequest,
  reason: string
) {
  const errorUrl = new URL(
    "/auth/error",
    request.url
  )

  errorUrl.searchParams.set(
    "reason",
    reason
  )

  return NextResponse.redirect(errorUrl)
}