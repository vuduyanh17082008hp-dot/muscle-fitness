"use client"

import {
  useMemo,
  useState,
  type FormEvent,
} from "react"
import { useRouter } from "next/navigation"

import { PasswordField } from "@/components/auth/password-field"
import { StatusMessage } from "@/components/auth/status-message"
import { getFriendlyAuthError } from "@/lib/auth/errors"
import { createClient } from "@/lib/supabase/client"

export function ResetPasswordForm() {
  const router = useRouter()

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] =
    useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const requirements = useMemo(
    () => ({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      number: /[0-9]/.test(password),
      symbol: /[^A-Za-z0-9]/.test(password),
    }),
    [password]
  )

  async function handleReset(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError("")

    if (password.length < 8) {
      setError("Mật khẩu phải có ít nhất 8 ký tự.")
      return
    }

    if (password !== confirmPassword) {
      setError("Hai mật khẩu không giống nhau.")
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()

      const { error: updateError } =
        await supabase.auth.updateUser({
          password,
        })

      if (updateError) {
        throw updateError
      }

      await supabase.auth.signOut()

      router.replace(
        "/login?message=password-updated"
      )
      router.refresh()
    } catch (resetError) {
      setError(
        getFriendlyAuthError(resetError)
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <StatusMessage type="error">
          {error}
        </StatusMessage>
      ) : null}

      <form
        onSubmit={handleReset}
        className="space-y-4"
      >
        <PasswordField
          id="new-password"
          label="New password"
          value={password}
          disabled={loading}
          minLength={8}
          autoComplete="new-password"
          placeholder="Create a secure password"
          onChange={setPassword}
        />

        <div className="grid grid-cols-2 gap-2">
          <Requirement
            completed={requirements.length}
            label="8+ characters"
          />

          <Requirement
            completed={requirements.uppercase}
            label="Uppercase letter"
          />

          <Requirement
            completed={requirements.number}
            label="Number"
          />

          <Requirement
            completed={requirements.symbol}
            label="Symbol"
          />
        </div>

        <PasswordField
          id="confirm-new-password"
          label="Confirm new password"
          value={confirmPassword}
          disabled={loading}
          minLength={8}
          autoComplete="new-password"
          placeholder="Enter the new password again"
          onChange={setConfirmPassword}
        />

        <button
          type="submit"
          disabled={loading}
          className="flex h-13 min-h-13 w-full items-center justify-center gap-3 rounded-2xl bg-orange-500 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
              Updating...
            </>
          ) : (
            "Update password"
          )}
        </button>
      </form>
    </div>
  )
}

function Requirement({
  completed,
  label,
}: {
  completed: boolean
  label: string
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] transition ${
        completed
          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
          : "border-white/10 bg-white/[0.025] text-zinc-700"
      }`}
    >
      {completed ? "✓" : "○"} {label}
    </div>
  )
}