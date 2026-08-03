import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
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

  return (
    <AuthShell
      eyebrow="Secure password update"
      title="Set new password"
      description="Tạo mật khẩu mới mạnh hơn để bảo vệ dữ liệu luyện tập và thông tin cá nhân của bạn."
      sideTitle="Return with stronger protection."
      sideDescription="Mật khẩu tốt là lớp bảo vệ đầu tiên cho toàn bộ kế hoạch, dữ liệu cơ thể và lịch sử tiến trình của bạn."
      step="04 / 04"
    >
      <ResetPasswordForm />
    </AuthShell>
  )
}