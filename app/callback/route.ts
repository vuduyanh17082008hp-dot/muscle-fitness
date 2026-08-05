import type { User } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { syncAuthUserProfile } from "@/lib/auth/profile"
import { createClient } from "@/lib/supabase/server"

function getSafeNextPath(value: string | null): string {
  if (!value) {
    return "/dashboard"
  }

  /*
   * Chỉ cho redirect nội bộ.
   * Ngăn URL như //malicious-site.com.
   */
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard"
  }

  return value
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)

  const code = requestUrl.searchParams.get("code")
  const nextPath = getSafeNextPath(
    requestUrl.searchParams.get("next")
  )

  if (!code) {
    const loginUrl = new URL("/login", requestUrl.origin)

    loginUrl.searchParams.set(
      "error",
      "Authentication code was not found."
    )

    return NextResponse.redirect(loginUrl)
  }

  const supabase = await createClient()

  const {
    data: sessionData,
    error: exchangeError,
  } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    console.error("OAuth callback error:", exchangeError)

    const loginUrl = new URL("/login", requestUrl.origin)

    loginUrl.searchParams.set("error", exchangeError.message)

    return NextResponse.redirect(loginUrl)
  }

  /*
   * Khai báo rõ User | null.
   *
   * Đây là phần sửa lỗi:
   * Type 'User | null' is not assignable to type 'User'.
   */
  let user: User | null = sessionData.user ?? null

  /*
   * Một số trường hợp exchangeCodeForSession không trả user trực tiếp.
   * Khi đó lấy user lại từ session cookie vừa được tạo.
   */
  if (!user) {
    const {
      data: currentUserData,
      error: currentUserError,
    } = await supabase.auth.getUser()

    if (currentUserError) {
      console.error(
        "Could not read user after OAuth callback:",
        currentUserError
      )
    }

    user = currentUserData.user
  }

  if (!user) {
    const loginUrl = new URL("/login", requestUrl.origin)

    loginUrl.searchParams.set(
      "error",
      "Authentication succeeded but the user account could not be loaded."
    )

    return NextResponse.redirect(loginUrl)
  }

  /*
   * Tạo hoặc cập nhật profile sau khi đăng nhập.
   *
   * Profile sync lỗi không được làm client mất session.
   */
  try {
    await syncAuthUserProfile(supabase, user)
  } catch (profileError) {
    console.error(
      "Profile synchronization failed after login:",
      profileError
    )
  }

  return NextResponse.redirect(
    new URL(nextPath, requestUrl.origin)
  )
}