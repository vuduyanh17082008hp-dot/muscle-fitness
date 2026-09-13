import { AuthShell } from "@/components/auth/auth-shell"

import { ForgotPasswordForm } from "./forgot-password-form"

type ForgotPasswordPageProps = {
  searchParams: Promise<{
    error?: string
  }>
}

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = await searchParams

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Recover access"
      description="Enter your account email. We'll send you a secure link to create a new password."
      sideTitle="A setback is not the end."
      sideDescription="Losing access doesn't mean losing your progress. Recover your account and pick up where you left off."
      step="03 / 04"
    >
      <ForgotPasswordForm
        invalidLink={
          params.error === "invalid-reset-link"
        }
      />
    </AuthShell>
  )
}