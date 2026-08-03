import Link from "next/link"

export default function UnauthorizedPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.10),transparent_38%),linear-gradient(135deg,#030303,#0a0a0a)]" />

      <section className="relative z-10 w-full max-w-xl rounded-[36px] border border-red-400/20 bg-zinc-950/80 p-8 text-center shadow-[0_40px_120px_rgba(0,0,0,0.75)] backdrop-blur-xl sm:p-12">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-red-400/20 bg-red-500/10 text-red-400">
          <LockIcon />
        </div>

        <p className="mt-8 text-xs font-black uppercase tracking-[0.3em] text-red-400">
          Access denied
        </p>

        <h1 className="mt-4 text-4xl font-black uppercase tracking-[-0.04em] sm:text-5xl">
          Unauthorized
        </h1>

        <p className="mx-auto mt-5 max-w-md text-sm leading-7 text-zinc-500">
          Tài khoản của bạn không có quyền truy cập
          khu vực này. Hãy quay lại dashboard hoặc
          đăng nhập bằng tài khoản phù hợp.
        </p>

        <div className="mt-9 grid gap-3 sm:grid-cols-2">
          <Link
            href="/dashboard"
            className="flex h-13 min-h-13 items-center justify-center rounded-2xl bg-orange-500 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-orange-400"
          >
            Dashboard
          </Link>

          <Link
            href="/"
            className="flex h-13 min-h-13 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-xs font-black uppercase tracking-[0.16em] transition hover:bg-white/[0.07]"
          >
            Homepage
          </Link>
        </div>
      </section>
    </main>
  )
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-9 w-9"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="10"
        width="16"
        height="11"
        rx="3"
      />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v3" />
    </svg>
  )
}