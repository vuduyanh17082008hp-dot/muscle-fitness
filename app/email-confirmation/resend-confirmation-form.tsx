"use client"

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react"

import { StatusMessage } from "@/components/auth/status-message"
import { getFriendlyAuthError } from "@/lib/auth/errors"
import { createClient } from "@/lib/supabase/client"

export function ResendConfirmationForm({
  initialEmail,
}: {
  initialEmail: string
}) {
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)
  // Until hydration the submit handler isn't attached; a native submit would send the fields as a GET query string.
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) {
      return
    }

    const timer = window.setInterval(() => {
      setCountdown((current) =>
        Math.max(0, current - 1)
      )
    }, 1000)

    return () => window.clearInterval(timer)
  }, [countdown])

  async function handleResend(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError("")
    setSuccess("")

    if (countdown > 0) {
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()

      const { error: resendError } =
        await supabase.auth.resend({
          type: "signup",
          email: email.trim().toLowerCase(),
          options: {
            emailRedirectTo:
              window.location.origin,
          },
        })

      if (resendError) {
        throw resendError
      }

      setSuccess(
        "A new confirmation email has been sent."
      )
      setCountdown(60)
    } catch (resendError) {
      setError(
        getFriendlyAuthError(resendError)
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleResend}
      className="space-y-3"
    >
      {success ? (
        <StatusMessage type="success">
          {success}
        </StatusMessage>
      ) : null}

      {error ? (
        <StatusMessage type="error">
          {error}
        </StatusMessage>
      ) : null}

      <input
        type="email"
        required
        value={email}
        disabled={loading || countdown > 0}
        placeholder="you@example.com"
        onChange={(event) =>
          setEmail(event.target.value)
        }
        className="h-13 min-h-13 w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-mf-brand/60 focus:ring-4 focus:ring-mf-brand/10 disabled:opacity-50"
      />

      <button
        type="submit"
        disabled={
          !hydrated ||
          loading ||
          countdown > 0 ||
          !email.trim()
        }
        className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-mf-brand text-xs font-black uppercase tracking-[0.12em] text-mf-brand-ink transition hover:bg-mf-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? "Sending..."
          : countdown > 0
            ? `Resend in ${countdown}s`
            : "Resend confirmation"}
      </button>
    </form>
  )
}