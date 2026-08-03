"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function LogoutButton({
  className = "",
}: {
  className?: string
}) {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleLogout() {
    setLoading(true)
    setError("")

    try {
      const response = await fetch(
        "/auth/signout",
        {
          method: "POST",
        }
      )

      if (!response.ok) {
        throw new Error("Logout failed")
      }

      router.replace(
        "/login?message=logged-out"
      )
      router.refresh()
    } catch {
      setError("Không thể đăng xuất. Hãy thử lại.")
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        onClick={handleLogout}
        className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-5 text-xs font-black uppercase tracking-[0.14em] text-red-300 transition hover:border-red-400/40 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-300/30 border-t-red-300" />
            Logging out
          </>
        ) : (
          <>
            <LogoutIcon />
            Logout
          </>
        )}
      </button>

      {error ? (
        <p className="mt-2 text-xs text-red-300">
          {error}
        </p>
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
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    </svg>
  )
}