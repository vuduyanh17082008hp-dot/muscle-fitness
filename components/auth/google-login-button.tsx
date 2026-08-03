"use client"

import { useState } from "react"

import { createClient } from "@/lib/supabase/client"

export function GoogleLoginButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  async function handleGoogleLogin() {
    if (isLoading) return

    try {
      setIsLoading(true)
      setErrorMessage("")

      const supabase = createClient()

      const callbackUrl =
        `${window.location.origin}` +
        `/auth/callback?next=/dashboard`

      const { error } =
        await supabase.auth.signInWithOAuth({
          provider: "google",

          options: {
            redirectTo: callbackUrl,

            queryParams: {
              prompt: "select_account",
            },
          },
        })

      if (error) {
        throw error
      }

      /*
       * Khi thành công, Supabase tự chuyển trình duyệt
       * sang trang đăng nhập Google.
       */
    } catch (error) {
      console.error("Google OAuth error:", error)

      const message =
        error instanceof Error
          ? error.message
          : "Không thể đăng nhập bằng Google."

      setErrorMessage(message)
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={isLoading}
        className="
          flex h-12 w-full items-center justify-center gap-3
          rounded-xl border border-white/15
          bg-white/[0.04] px-4
          text-sm font-semibold text-white
          transition duration-200
          hover:border-white/30 hover:bg-white/[0.08]
          focus:outline-none focus:ring-2 focus:ring-red-500/50
          disabled:cursor-not-allowed disabled:opacity-60
        "
      >
        {isLoading ? (
          <>
            <span
              className="
                h-5 w-5 animate-spin rounded-full
                border-2 border-white/30 border-t-white
              "
            />

            <span>Đang kết nối Google...</span>
          </>
        ) : (
          <>
            <GoogleIcon />

            <span>Continue with Google</span>
          </>
        )}
      </button>

      {errorMessage && (
        <p
          role="alert"
          className="mt-3 text-center text-sm text-red-400"
        >
          {errorMessage}
        </p>
      )}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      viewBox="0 0 24 24"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"
      />

      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
      />

      <path
        fill="#FBBC05"
        d="M6.39 13.86A6 6 0 0 1 6.08 12c0-.65.11-1.27.31-1.86V7.52H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.48l3.35-2.62Z"
      />

      <path
        fill="#EA4335"
        d="M12 6.01c1.47 0 2.78.5 3.82 1.49l2.88-2.88C16.96 3 14.7 2 12 2a10 10 0 0 0-8.96 5.52l3.35 2.62C7.18 7.77 9.39 6.01 12 6.01Z"
      />
    </svg>
  )
}