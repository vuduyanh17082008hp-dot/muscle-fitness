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
      "Quá trình đăng nhập Google đã bị hủy hoặc không thể hoàn thành.",
  },

  "code-exchange-failed": {
    title: "Session creation failed",
    description:
      "Hệ thống không thể tạo phiên đăng nhập từ Google. Hãy thử lại.",
  },

  "invalid-confirmation-link": {
    title: "Invalid confirmation link",
    description:
      "Liên kết xác nhận không đầy đủ hoặc không đúng định dạng.",
  },

  "expired-confirmation-link": {
    title: "Confirmation link expired",
    description:
      "Liên kết xác nhận email đã hết hạn. Hãy yêu cầu gửi email mới.",
  },

  "expired-recovery-link": {
    title: "Recovery link expired",
    description:
      "Liên kết đặt lại mật khẩu đã hết hạn. Hãy yêu cầu liên kết mới.",
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
        "Không thể hoàn tất quá trình xác thực. Vui lòng thử lại.",
    }

  return (
    <AuthShell
      eyebrow="Authentication interrupted"
      title={content.title}
      description={content.description}
      sideTitle="Stop. Reset. Continue."
      sideDescription="Một lỗi kỹ thuật không quyết định kết quả của bạn. Kiểm tra lại thông tin và tiếp tục quá trình."
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