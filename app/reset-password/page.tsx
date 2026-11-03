import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { isRecoverySession } from "@/lib/auth/recovery-session"
import { createClient } from "@/lib/supabase/server"

import { ResetPasswordForm } from "./reset-password-form"

export const dynamic = "force-dynamic"

export default async function ResetPasswordPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(
      "/forgot-password?error=invalid-reset-link"
    )
  }

  /*
   * Only a session opened by a recovery link may use this form; an
   * ordinary signed-in session goes back to the dashboard.
   */
  const { data: claimsData } =
    await supabase.auth.getClaims()

  if (!isRecoverySession(claimsData?.claims)) {
    redirect("/dashboard")
  }

  return (
    <AuthShell
      eyebrow="Secure password update"
      title="Set new password"
      description="Create a stronger new password to protect your training data and personal information."
      sideTitle="Return with stronger protection."
      sideDescription="A strong password is the first layer of protection for your entire plan, body data, and progress history."
      step="04 / 04"
    >
      <ResetPasswordForm />
    </AuthShell>
  )
}