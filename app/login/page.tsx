import Link from "next/link"

import { getSafeNext } from "@/lib/auth/safe-next"

import { LoginForm } from "./login-form"

export const dynamic = "force-dynamic"

type LoginPageProps = {
  searchParams: Promise<{
    next?: string
    message?: string
    error?: string
  }>
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const params = await searchParams

  const next = getSafeNext(
    params.next,
    "/dashboard"
  )

  let message: string | undefined
  let initialError: string | undefined

  switch (params.message) {
    case "email-confirmed":
      message =
        "Email đã được xác nhận. Bây giờ bạn có thể đăng nhập."
      break

    case "password-updated":
      message =
        "Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới."
      break

    case "logged-out":
      message = "Bạn đã đăng xuất thành công."
      break
  }

  switch (params.error) {
    case "oauth-failed":
      initialError =
        "Google Login không hoàn tất. Vui lòng thử lại."
      break

    case "confirmation-failed":
      initialError =
        "Liên kết xác nhận email không hợp lệ hoặc đã hết hạn."
      break
  }

  /*
   * Không kiểm tra user và không redirect trong file này.
   * Như vậy /login luôn hiển thị đúng trang Login,
   * kể cả khi browser còn session cũ.
   */

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-12 text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-950 to-zinc-900" />

      <div className="absolute left-1/2 top-0 h-[450px] w-[450px] -translate-x-1/2 rounded-full bg-orange-500/10 blur-3xl" />

      <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-red-500/5 blur-3xl" />

      <div className="pointer-events-none absolute inset-0 opacity-[0.035]">
        <div className="h-full w-full bg-[linear-gradient(90deg,transparent_49%,white_50%,transparent_51%)] bg-[length:70px_70px]" />
      </div>

      <section className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-black/80 p-6 shadow-2xl shadow-black/80 backdrop-blur-xl sm:p-8">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-3"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-orange-400/30 bg-orange-500/10 text-sm font-black text-orange-400">
            MF
          </span>

          <span>
            <span className="block text-sm font-black tracking-[0.24em] text-white">
              MUSCLE FITNESS
            </span>

            <span className="text-xs text-zinc-500">
              Built through discipline
            </span>
          </span>
        </Link>

        <header className="mb-7">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.28em] text-orange-400">
            Member access
          </p>

          <h1 className="text-4xl font-black uppercase tracking-tight text-white">
            Welcome Back
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Continue your transformation. Your training,
            nutrition and progress are waiting.
          </p>
        </header>

        <LoginForm
          next={next}
          message={message}
          initialError={initialError}
        />

        <p className="mt-8 text-center text-xs leading-5 text-zinc-600">
          By continuing, you agree to the Muscle Fitness
          terms and privacy policy.
        </p>
      </section>
    </main>
  )
}