function Block({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03] ${className ?? ""}`}
    />
  );
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6 md:space-y-8" aria-busy="true">
      <div className="space-y-3">
        <Block className="h-9 w-72 max-w-full" />
        <Block className="h-4 w-56 max-w-full" />
      </div>

      <div>
        <Block className="mb-3 h-4 w-40" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Block className="h-36" />
          <Block className="h-36" />
          <Block className="h-36" />
        </div>
      </div>

      <div>
        <Block className="mb-3 h-4 w-32" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Block className="h-28" />
          <Block className="h-28" />
          <Block className="h-28" />
          <Block className="h-28" />
        </div>
      </div>

      <Block className="h-64" />
      <Block className="h-16" />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Block className="h-80" />
        <div className="space-y-6">
          <Block className="h-40" />
          <Block className="h-52" />
        </div>
      </div>

      <Block className="h-72" />
      <Block className="h-28" />
    </div>
  );
}
