"use client"

import {
  useState,
  type FormEvent,
} from "react"
import Link from "next/link"

import { StatusMessage } from "@/components/auth/status-message"
import { getFriendlyAuthError } from "@/lib/auth/errors"
import { createClient } from "@/lib/supabase/client"

export function ForgotPasswordForm({
  invalidLink,
}: {
  invalidLink: boolean
}) {
  const [email, setEmail] = useState("")
  const [error, setError] = useState(
    invalidLink
      ? "Liên kết reset không hợp lệ hoặc đã hết hạn."
      : ""
  )
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError("")
    setLoading(true)

    try {
      const supabase = createClient()

      const normalizedEmail =
        email.trim().toLowerCase()

      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          {
            /*
             * Email template sẽ dùng RedirectTo
             * để tạo đường dẫn /auth/confirm.
             */
            redirectTo: window.location.origin,
          }
        )

      if (resetError) {
        throw resetError
      }

      setSent(true)
    } catch (resetError) {
      setError(
        getFriendlyAuthError(resetError)
      )
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="space-y-6">
        <StatusMessage type="success">
          <strong className="block text-white">
            Recovery email sent
          </strong>

          <span className="mt-1 block">
            Nếu email này được đăng ký, bạn sẽ nhận
            được liên kết đặt lại mật khẩu.
          </span>
        </StatusMessage>

        <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
            Sent to
          </p>

          <p className="mt-2 break-all font-black text-white">
            {email}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setSent(false)
            setEmail("")
          }}
          className="flex h-13 min-h-13 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-xs font-black uppercase tracking-[0.16em] transition hover:bg-white/[0.07]"
        >
          Use another email
        </button>

        <Link
          href="/login"
          className="flex h-13 min-h-13 items-center justify-center rounded-2xl bg-orange-500 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-orange-400"
        >
          Return to login
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error ? (
        <StatusMessage type="error">
          {error}
        </StatusMessage>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <div>
          <label
            htmlFor="recovery-email"
            className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-zinc-400"
          >
            Email address
          </label>

          <input
            id="recovery-email"
            type="email"
            required
            value={email}
            disabled={loading}
            autoComplete="email"
            placeholder="you@example.com"
            onChange={(event) =>
              setEmail(event.target.value)
            }
            className="h-13 min-h-13 w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-orange-400/60 focus:ring-4 focus:ring-orange-400/10 disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="flex h-13 min-h-13 w-full items-center justify-center gap-3 rounded-2xl bg-orange-500 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
              Sending...
            </>
          ) : (
            "Send recovery link"
          )}
        </button>
      </form>

      <Link
        href="/login"
        className="block text-center text-sm font-black text-zinc-600 transition hover:text-orange-400"
      >
        Back to login
      </Link>
    </div>
  )
}