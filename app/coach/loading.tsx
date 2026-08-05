export default function CoachLoading() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#070707] px-4 text-white">
      <div
        role="status"
        aria-live="polite"
        className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#141414] via-[#0d0d0d] to-black px-8 py-12 text-center shadow-2xl shadow-black"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.13),transparent_55%)]"
        />

        <div className="relative">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/[0.06]">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-2 border-white/10" />

              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-r-amber-500 border-t-amber-500" />

              <div className="absolute inset-[10px] animate-pulse rounded-full bg-amber-500/30 shadow-[0_0_24px_rgba(245,158,11,0.35)]" />
            </div>
          </div>

          <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-amber-500">
            Muscle Fitness AI
          </p>

          <h1 className="mt-3 text-xl font-bold text-white">
            Đang khởi tạo AI Coach...
          </h1>

          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-500">
            Đang tải hồ sơ, mục tiêu và dữ liệu tập luyện của bạn.
          </p>

          <div className="mx-auto mt-7 flex max-w-xs gap-2">
            <div className="h-1 flex-1 animate-pulse rounded-full bg-amber-500" />
            <div className="h-1 flex-1 animate-pulse rounded-full bg-amber-500/50 [animation-delay:150ms]" />
            <div className="h-1 flex-1 animate-pulse rounded-full bg-amber-500/20 [animation-delay:300ms]" />
          </div>

          <span className="sr-only">
            Đang khởi tạo AI Coach
          </span>
        </div>
      </div>
    </main>
  )
}