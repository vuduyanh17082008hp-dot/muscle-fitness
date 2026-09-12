import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { createClient } from "@/lib/supabase/server"

import { RegisterForm } from "./register-form"

export const dynamic = "force-dynamic"

export default async function RegisterPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Người đang có session không cần đăng ký lại.
  if (user) {
    redirect("/dashboard")
  }

  return (
    <AuthShell
      eyebrow="Create your account"
      title="Start stronger"
      description="Create an account to save your training plan, nutrition and progress."
      sideTitle="Your transformation starts here."
      sideDescription="Don't wait for the perfect moment. Start with real data, a clear plan, and discipline built one day at a time."
      step="01 / 04"
    >
      <RegisterForm />
    </AuthShell>
  )
}