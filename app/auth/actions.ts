"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { syncAuthUserProfile } from "@/lib/auth/profile"
import { createClient } from "@/lib/supabase/server"

function getRequiredFormValue(
  formData: FormData,
  name: string
) {
  const value = formData.get(name)

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(`${name} is required.`)
  }

  return value.trim()
}

function getSafeNextPath(value: FormDataEntryValue | null) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/dashboard"
  }

  return value
}

async function getSiteUrl() {
  const requestHeaders = await headers()

  return (
    requestHeaders.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "")
}

export async function loginAction(
  formData: FormData
) {
  const email = getRequiredFormValue(
    formData,
    "email"
  ).toLowerCase()

  const password = getRequiredFormValue(
    formData,
    "password"
  )

  const next = getSafeNextPath(
    formData.get("next")
  )

  const supabase = await createClient()

  const {
    data,
    error,
  } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(
        error.message
      )}`
    )
  }

  if (data.user) {
    try {
      await syncAuthUserProfile(
        supabase,
        data.user
      )
    } catch (profileError) {
      /*
       * Không signOut khi profile sync lỗi.
       * Điều này tránh làm mất session vừa đăng nhập.
       */
      console.error(
        "Profile synchronization failed:",
        profileError
      )
    }
  }

  revalidatePath("/", "layout")
  redirect(next)
}

export async function registerAction(
  formData: FormData
) {
  const fullName = getRequiredFormValue(
    formData,
    "full_name"
  )

  const email = getRequiredFormValue(
    formData,
    "email"
  ).toLowerCase()

  const password = getRequiredFormValue(
    formData,
    "password"
  )

  if (password.length < 8) {
    redirect(
      "/register?error=Password%20must%20contain%20at%20least%208%20characters."
    )
  }

  const siteUrl = await getSiteUrl()
  const supabase = await createClient()

  const {
    data,
    error,
  } = await supabase.auth.signUp({
    email,
    password,

    options: {
      data: {
        full_name: fullName,
        name: fullName,
      },

      emailRedirectTo:
        `${siteUrl}/callback?next=/dashboard`,
    },
  })

  if (error) {
    redirect(
      `/register?error=${encodeURIComponent(
        error.message
      )}`
    )
  }

  /*
   * Nếu email confirmation bị tắt,
   * Supabase có thể trả session ngay lập tức.
   */
  if (data.session && data.user) {
    try {
      await syncAuthUserProfile(
        supabase,
        data.user
      )
    } catch (profileError) {
      console.error(
        "Profile synchronization failed:",
        profileError
      )
    }

    revalidatePath("/", "layout")
    redirect("/dashboard")
  }

  redirect(
    "/login?message=Check%20your%20email%20to%20confirm%20your%20account."
  )
}

export async function signInWithGoogleAction(
  formData: FormData
) {
  const siteUrl = await getSiteUrl()

  const next = getSafeNextPath(
    formData.get("next")
  )

  const supabase = await createClient()

  const {
    data,
    error,
  } = await supabase.auth.signInWithOAuth({
    provider: "google",

    options: {
      redirectTo:
        `${siteUrl}/callback?next=${encodeURIComponent(
          next
        )}`,

      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  })

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(
        error.message
      )}`
    )
  }

  if (!data.url) {
    redirect(
      "/login?error=Google%20login%20URL%20was%20not%20created."
    )
  }

  redirect(data.url)
}