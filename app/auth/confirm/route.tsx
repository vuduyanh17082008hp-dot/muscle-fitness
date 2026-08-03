import type { EmailOtpType } from "@supabase/supabase-js"
import {
  NextResponse,
  type NextRequest,
} from "next/server"

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

  const supabase = await createClient()

  const { error } =
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType as EmailOtpType,
    })

  if (error) {
    return redirectToError(
      request,
      rawType === "recovery"
        ? "expired-recovery-link"
        : "expired-confirmation-link"
    )
  }

  /*
   * Recovery cần giữ session để update password.
   */
  if (rawType === "recovery") {
    return NextResponse.redirect(
      new URL("/reset-password", request.url)
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