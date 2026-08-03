"use client"

import {
  useMemo,
  useState,
  type FormEvent,
} from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { PasswordField } from "@/components/auth/password-field"
import { StatusMessage } from "@/components/auth/status-message"
import { getFriendlyAuthError } from "@/lib/auth/errors"
import { createClient } from "@/lib/supabase/client"

type PendingMethod = "email" | "google" | null

export function RegisterForm() {
  const router = useRouter()

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] =
    useState("")
  const [acceptedTerms, setAcceptedTerms] =
    useState(false)

  const [error, setError] = useState("")
  const [pending, setPending] =
    useState<PendingMethod>(null)

  const passwordStrength = useMemo(() => {
    let score = 0

    if (password.length >= 8) score += 1
    if (/[A-Z]/.test(password)) score += 1
    if (/[0-9]/.test(password)) score += 1
    if (/[^A-Za-z0-9]/.test(password)) score += 1

    return score
  }, [password])

  async function handleRegister(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError("")

    const normalizedName = fullName.trim()
    const normalizedEmail =
      email.trim().toLowerCase()

    if (normalizedName.length < 2) {
      setError("Vui lòng nhập họ tên hợp lệ.")
      return
    }

    if (!normalizedEmail) {
      setError("Vui lòng nhập email.")
      return
    }

    if (password.length < 8) {
      setError("Mật khẩu phải có ít nhất 8 ký tự.")
      return
    }

    if (password !== confirmPassword) {
      setError("Hai mật khẩu không giống nhau.")
      return
    }

    if (!acceptedTerms) {
      setError(
        "Bạn cần đồng ý với điều khoản sử dụng."
      )
      return
    }

    setPending("email")

    try {
      const supabase = createClient()

      const { data, error: signUpError } =
        await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: normalizedName,
            },
            emailRedirectTo:
              window.location.origin,
          },
        })

      if (signUpError) {
        throw signUpError
      }

      // Khi xác nhận email bị tắt trong Supabase.
      if (data.session) {
        router.replace("/dashboard")
        router.refresh()
        return
      }

      router.push(
        `/email-confirmation?email=${encodeURIComponent(
          normalizedEmail
        )}`
      )
    } catch (registerError) {
      setError(
        getFriendlyAuthError(registerError)
      )
    } finally {
      setPending(null)
    }
  }

  async function handleGoogleRegister() {
    setError("")
    setPending("google")

    try {
      const supabase = createClient()

      const callbackUrl =
        `${window.location.origin}/auth/callback` +
        "?next=/dashboard"

      const { error: googleError } =
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: callbackUrl,
          },
        })

      if (googleError) {
        throw googleError
      }
    } catch (googleError) {
      setError(
        getFriendlyAuthError(googleError)
      )
      setPending(null)
    }
  }

  const disabled = pending !== null

  return (
    <div className="space-y-6">
      {error ? (
        <StatusMessage type="error">
          {error}
        </StatusMessage>
      ) : null}

      <form
        onSubmit={handleRegister}
        className="space-y-4"
      >
        <TextField
          id="full-name"
          label="Full name"
          type="text"
          autoComplete="name"
          value={fullName}
          disabled={disabled}
          placeholder="Your full name"
          onChange={setFullName}
        />

        <TextField
          id="register-email"
          label="Email address"
          type="email"
          autoComplete="email"
          value={email}
          disabled={disabled}
          placeholder="you@example.com"
          onChange={setEmail}
        />

        <PasswordField
          id="register-password"
          label="Password"
          value={password}
          disabled={disabled}
          minLength={8}
          autoComplete="new-password"
          placeholder="Minimum 8 characters"
          onChange={setPassword}
        />

        {password ? (
          <PasswordStrength
            strength={passwordStrength}
          />
        ) : null}

        <PasswordField
          id="confirm-password"
          label="Confirm password"
          value={confirmPassword}
          disabled={disabled}
          minLength={8}
          autoComplete="new-password"
          placeholder="Enter your password again"
          onChange={setConfirmPassword}
        />

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition hover:border-white/20">
          <input
            type="checkbox"
            checked={acceptedTerms}
            disabled={disabled}
            onChange={(event) =>
              setAcceptedTerms(
                event.target.checked
              )
            }
            className="mt-1 h-4 w-4 accent-orange-500"
          />

          <span className="text-xs leading-5 text-zinc-500">
            Tôi đồng ý với điều khoản sử dụng và chính
            sách bảo mật của Muscle Fitness.
          </span>
        </label>

        <button
          type="submit"
          disabled={disabled}
          className="flex min-h-13 w-full items-center justify-center gap-3 rounded-2xl bg-orange-500 px-5 py-4 text-xs font-black uppercase tracking-[0.18em] text-black transition hover:bg-orange-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === "email" ? (
            <>
              <Spinner dark />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <Divider />

      <button
        type="button"
        disabled={disabled}
        onClick={handleGoogleRegister}
        className="flex min-h-13 w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white px-5 py-4 text-sm font-black text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending === "google" ? (
          <>
            <Spinner />
            Connecting...
          </>
        ) : (
          <>
            <GoogleIcon />
            Continue with Google
          </>
        )}
      </button>

      <p className="text-center text-sm text-zinc-600">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-black text-orange-400 transition hover:text-orange-300"
        >
          Login
        </Link>
      </p>
    </div>
  )
}

function TextField({
  id,
  label,
  type,
  autoComplete,
  value,
  disabled,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  type: string
  autoComplete: string
  value: string
  disabled: boolean
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-zinc-400"
      >
        {label}
      </label>

      <input
        id={id}
        name={id}
        type={type}
        required
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="min-h-13 w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4 text-sm text-white outline-none transition placeholder:text-zinc-700 hover:border-white/20 focus:border-orange-400/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-orange-400/10 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  )
}

function PasswordStrength({
  strength,
}: {
  strength: number
}) {
  const labels = [
    "Very weak",
    "Basic",
    "Medium",
    "Strong",
    "Excellent",
  ]

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className={[
              "h-1.5 rounded-full transition",
              strength >= level
                ? "bg-orange-400"
                : "bg-white/10",
            ].join(" ")}
          />
        ))}
      </div>

      <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-600">
        Password strength:{" "}
        <span className="text-zinc-400">
          {labels[strength]}
        </span>
      </p>
    </div>
  )
}

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-white/10" />

      <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-700">
        or
      </span>

      <span className="h-px flex-1 bg-white/10" />
    </div>
  )
}

function Spinner({
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
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden="true"
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