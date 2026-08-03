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
      description="Tạo tài khoản để lưu kế hoạch luyện tập, dinh dưỡng và toàn bộ tiến độ cá nhân."
      sideTitle="Your transformation starts here."
      sideDescription="Không cần chờ đến khi hoàn hảo. Hãy bắt đầu bằng dữ liệu thật, một kế hoạch rõ ràng và sự kỷ luật được xây dựng từng ngày."
      step="01 / 04"
    >
      <RegisterForm />
    </AuthShell>
  )
}