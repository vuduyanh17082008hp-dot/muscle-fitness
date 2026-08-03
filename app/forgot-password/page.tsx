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
      description="Nhập email tài khoản. Chúng tôi sẽ gửi một liên kết bảo mật để bạn tạo mật khẩu mới."
      sideTitle="A setback is not the end."
      sideDescription="Mất quyền truy cập không có nghĩa là mất toàn bộ tiến trình. Khôi phục tài khoản và tiếp tục nơi bạn đã dừng lại."
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