"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type LogoutButtonProps = {
  compact?: boolean
  className?: string
}

export function LogoutButton({
  compact = false,
  className = "",
}: LogoutButtonProps) {
  const router = useRouter()

  const [loading, setLoading] =
    useState(false)

  const [error, setError] = useState("")

  async function handleLogout() {
    if (loading) {
      return
    }

    setLoading(true)
    setError("")

    try {
      const response = await fetch(
        "/auth/signout",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        }
      )

      const result = (await response.json()) as {
        success?: boolean
        message?: string
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Logout failed"
        )
      }

      /*
       * replace() để người dùng không nhấn Back
       * và quay lại dashboard đã được cache.
       */
      router.replace(
        "/login?message=logged-out"
      )

      /*
       * Yêu cầu Next.js tải lại Server Components,
       * đảm bảo user session đã bị xóa.
       */
      router.refresh()
    } catch (logoutError) {
      console.error(
        "Logout error:",
        logoutError
      )

      setError(
        "Không thể đăng xuất. Hãy thử lại."
      )

      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={loading}
        onClick={handleLogout}
        aria-label="Logout from Muscle Fitness"
        className={[
          "group inline-flex items-center justify-center gap-2",
          "rounded-xl border border-red-400/20",
          "bg-red-500/[0.08] text-red-300",
          "transition duration-300",
          "hover:border-red-400/40",
          "hover:bg-red-500/15",
          "hover:text-red-200",
          "focus:outline-none",
          "focus:ring-4",
          "focus:ring-red-500/10",
          "disabled:cursor-not-allowed",
          "disabled:opacity-50",
          compact
            ? "h-10 w-10"
            : "h-11 px-4",
          className,
        ].join(" ")}
      >
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-200/30 border-t-red-200" />

            {!compact ? (
              <span className="text-[11px] font-black uppercase tracking-[0.14em]">
                Logging out
              </span>
            ) : null}
          </>
        ) : (
          <>
            <LogoutIcon />

            {!compact ? (
              <span className="text-[11px] font-black uppercase tracking-[0.14em]">
                Logout
              </span>
            ) : null}
          </>
        )}
      </button>

      {error ? (
        <div
          role="alert"
          className="absolute right-0 top-full z-50 mt-3 w-64 rounded-2xl border border-red-400/20 bg-zinc-950 p-4 text-xs leading-5 text-red-300 shadow-2xl"
        >
          {error}

          <button
            type="button"
            onClick={() => setError("")}
            className="mt-3 block font-black uppercase tracking-wider text-white hover:text-orange-400"
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  )
}

function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
      aria-hidden="true"
    >
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    </svg>
  )
}