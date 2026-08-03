"use client"

import {
  useState,
  type FormEvent,
} from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { getFriendlyAuthError } from "@/lib/auth/errors"
import { createClient } from "@/lib/supabase/client"

type LoginFormProps = {
  next: string
  message?: string
  initialError?: string
}

type PendingMethod =
  | "email"
  | "google"
  | "logout"
  | null

export function LoginForm({
  next,
  message,
  initialError,
}: LoginFormProps) {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState(
    initialError ?? ""
  )

  const [pending, setPending] =
    useState<PendingMethod>(null)

  async function handleEmailLogin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError("")
    setPending("email")

    try {
      const normalizedEmail =
        email.trim().toLowerCase()

      if (!normalizedEmail) {
        throw new Error("Email is required")
      }

      if (!password) {
        throw new Error("Password is required")
      }

      const supabase = createClient()

      /*
       * Nếu browser còn account cũ,
       * đăng xuất local session trước.
       */
      await supabase.auth.signOut({
        scope: "local",
      })

      const { error: signInError } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })

      if (signInError) {
        throw signInError
      }

      router.replace(next)
      router.refresh()
    } catch (loginError) {
      setError(
        getFriendlyAuthError(loginError)
      )

      setPending(null)
    }
  }

  async function handleGoogleLogin() {
    setError("")
    setPending("google")

    try {
      const supabase = createClient()

      await supabase.auth.signOut({
        scope: "local",
      })

      const redirectTo =
        `${window.location.origin}/auth/callback` +
        `?next=${encodeURIComponent(next)}`

      const { error: oauthError } =
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo,
          },
        })

      if (oauthError) {
        throw oauthError
      }
    } catch (googleError) {
      setError(
        getFriendlyAuthError(googleError)
      )

      setPending(null)
    }
  }

  async function clearCurrentSession() {
    setError("")
    setPending("logout")

    try {
      const supabase = createClient()

      const { error: logoutError } =
        await supabase.auth.signOut({
          scope: "local",
        })

      if (logoutError) {
        throw logoutError
      }

      router.replace("/login?message=logged-out")
      router.refresh()
    } catch (logoutError) {
      setError(
        getFriendlyAuthError(logoutError)
      )

      setPending(null)
    }
  }

  const disabled = pending !== null

  return (
    <div>
      {message ? (
        <div
          aria-live="polite"
          className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-300"
        >
          {message}
        </div>
      ) : null}

      {error ? (
        <div
          aria-live="assertive"
          className="mb-5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-300"
        >
          {error}
        </div>
      ) : null}

      <form
        onSubmit={handleEmailLogin}
        className="space-y-5"
      >
        <div>
          <label
            htmlFor="login-email"
            className="mb-2 block text-sm font-bold text-zinc-300"
          >
            Email address
          </label>

          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={disabled}
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            placeholder="you@example.com"
            className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-white outline-none transition placeholder:text-zinc-600 hover:border-white/20 focus:border-orange-400/70 focus:ring-4 focus:ring-orange-400/10 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-4">
            <label
              htmlFor="login-password"
              className="text-sm font-bold text-zinc-300"
            >
              Password
            </label>

            <Link
              href="/forgot-password"
              className="text-xs font-bold text-orange-400 transition hover:text-orange-300"
            >
              Forgot password?
            </Link>
          </div>

          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={disabled}
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            placeholder="Enter your password"
            className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-white outline-none transition placeholder:text-zinc-600 hover:border-white/20 focus:border-orange-400/70 focus:ring-4 focus:ring-orange-400/10 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <button
          type="submit"
          disabled={disabled}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-orange-500 px-4 text-sm font-black uppercase tracking-[0.12em] text-black transition hover:bg-orange-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === "email" ? (
            <>
              <LoadingSpinner dark />
              Signing in...
            </>
          ) : (
            "Enter dashboard"
          )}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" />

        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600">
          or continue with
        </span>

        <span className="h-px flex-1 bg-white/10" />
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={handleGoogleLogin}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white px-4 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending === "google" ? (
          <>
            <LoadingSpinner />
            Connecting...
          </>
        ) : (
          <>
            <GoogleIcon />
            Continue with Google
          </>
        )}
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={clearCurrentSession}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-60"
      >
        {pending === "logout" ? (
          <>
            <LoadingSpinner />
            Clearing session...
          </>
        ) : (
          "Clear previous session"
        )}
      </button>

      <p className="mt-7 text-center text-sm text-zinc-500">
        New to Muscle Fitness?{" "}
        <Link
          href="/register"
          className="font-black text-orange-400 transition hover:text-orange-300"
        >
          Create account
        </Link>
      </p>
    </div>
  )
}

function LoadingSpinner({
  dark = false,
}: {
  dark?: boolean
}) {
  return (
    <span
      className={[
        "h-5 w-5 animate-spin rounded-full border-2",
        dark
          ? "border-black/30 border-t-black"
          : "border-zinc-400 border-t-zinc-950",
      ].join(" ")}
    />
  )
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z"
      />

      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.98-.9 6.64-2.38l-3.24-2.53c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z"
      />

      <path
        fill="#FBBC05"
        d="M6.39 13.92A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.38 3.13 1.04 4.53l3.35-2.61Z"
      />

      <path
        fill="#EA4335"
        d="M12 5.95c1.47 0 2.79.51 3.83 1.5l2.87-2.87C16.97 2.97 14.7 2 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z"
      />
    </svg>
  )
}