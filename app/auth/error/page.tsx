import Link from "next/link"

import { AuthShell } from "@/components/auth/auth-shell"

type AuthErrorPageProps = {
  searchParams: Promise<{
    reason?: string
  }>
}

const messages: Record<
  string,
  {
    title: string
    description: string
  }
> = {
  "oauth-cancelled": {
    title: "Google Login cancelled",
    description:
      "The Google sign-in process was cancelled or could not be completed.",
  },

  "code-exchange-failed": {
    title: "Session creation failed",
    description:
      "We couldn't create a login session from Google. Please try again.",
  },

  "invalid-confirmation-link": {
    title: "Invalid confirmation link",
    description:
      "The confirmation link is incomplete or improperly formatted.",
  },

  "expired-confirmation-link": {
    title: "Confirmation link expired",
    description:
      "Your email confirmation link has expired. Please request a new one.",
  },

  "expired-recovery-link": {
    title: "Recovery link expired",
    description:
      "Your password reset link has expired. Please request a new one.",
  },
}

export default async function AuthErrorPage({
  searchParams,
}: AuthErrorPageProps) {
  const params = await searchParams

  const content =
    messages[params.reason ?? ""] ?? {
      title: "Authentication failed",
      description:
        "We couldn't complete the authentication process. Please try again.",
    }

  return (
    <AuthShell
      eyebrow="Authentication interrupted"
      title={content.title}
      description={content.description}
      sideTitle="Stop. Reset. Continue."
      sideDescription="A technical error doesn't decide your outcome. Double-check your details and continue."
      step="SYSTEM"
    >
      <div className="space-y-3">
        <Link
          href="/login"
          className="flex h-13 min-h-13 items-center justify-center rounded-2xl bg-orange-500 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-orange-400"
        >
          Return to login
        </Link>

        <Link
          href="/forgot-password"
          className="flex h-13 min-h-13 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-xs font-black uppercase tracking-[0.16em] transition hover:bg-white/[0.07]"
        >
          Recover account
        </Link>

        <Link
          href="/register"
          className="block py-3 text-center text-sm font-black text-zinc-600 transition hover:text-orange-400"
        >
          Create a new account
        </Link>
      </div>
    </AuthShell>
  )
}