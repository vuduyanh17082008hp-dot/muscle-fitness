"use client"

import { useState } from "react"

type PasswordFieldProps = {
  id: string
  label: string
  value: string
  placeholder?: string
  autoComplete?: string
  disabled?: boolean
  minLength?: number
  onChange: (value: string) => void
}

export function PasswordField({
  id,
  label,
  value,
  placeholder = "Enter your password",
  autoComplete = "current-password",
  disabled = false,
  minLength,
  onChange,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-zinc-400"
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          value={value}
          required
          disabled={disabled}
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="h-13 min-h-13 w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 pr-12 text-sm text-white outline-none transition placeholder:text-zinc-700 hover:border-white/20 focus:border-orange-400/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-orange-400/10 disabled:cursor-not-allowed disabled:opacity-50"
        />

        <button
          type="button"
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((current) => !current)}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-zinc-600 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="m3 3 18 18" />
      <path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.2 3" />
      <path d="M6.2 6.2A17 17 0 0 0 2.5 12s3.5 6 9.5 6a9.5 9.5 0 0 0 3.2-.5" />
    </svg>
  )
}