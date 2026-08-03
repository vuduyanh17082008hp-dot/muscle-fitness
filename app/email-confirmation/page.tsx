import Link from "next/link"

import { AuthShell } from "@/components/auth/auth-shell"

import { ResendConfirmationForm } from "./resend-confirmation-form"

type EmailConfirmationPageProps = {
  searchParams: Promise<{
    email?: string
  }>
}

export default async function EmailConfirmationPage({
  searchParams,
}: EmailConfirmationPageProps) {
  const params = await searchParams
  const email = params.email ?? ""

  return (
    <AuthShell
      eyebrow="Verification required"
      title="Check your inbox"
      description="Một bước cuối cùng để kích hoạt tài khoản Muscle Fitness của bạn."
      sideTitle="Confirm. Return. Begin."
      sideDescription="Xác nhận email giúp bảo vệ tài khoản và bảo đảm dữ liệu luyện tập của bạn luôn thuộc quyền kiểm soát của chính bạn."
      step="02 / 04"
    >
      <div className="space-y-6">
        <div className="rounded-3xl border border-orange-400/20 bg-orange-500/[0.07] p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
              <MailIcon />
            </span>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300">
                Confirmation sent
              </p>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Chúng tôi đã gửi liên kết xác nhận đến:
              </p>

              <p className="mt-1 break-all font-black text-white">
                {email || "your email address"}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 text-sm leading-6 text-zinc-500">
          <p>
            1. Mở email từ Muscle Fitness hoặc Supabase.
          </p>

          <p>
            2. Nhấn nút xác nhận tài khoản.
          </p>

          <p>
            3. Quay lại Login và đăng nhập.
          </p>
        </div>

        <ResendConfirmationForm
          initialEmail={email}
        />

        <Link
          href="/login"
          className="flex h-13 min-h-13 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-xs font-black uppercase tracking-[0.16em] text-white transition hover:border-orange-400/30 hover:bg-orange-500/10 hover:text-orange-300"
        >
          Return to login
        </Link>
      </div>
    </AuthShell>
  )
}

function MailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="3"
      />
      <path d="m4 7 8 6 8-6" />
    </svg>
  )
}