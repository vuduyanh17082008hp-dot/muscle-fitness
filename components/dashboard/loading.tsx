function Skeleton({
  className,
}: Readonly<{
  className: string
}>) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-white/[0.07] ${className}`}
    />
  )
}

function StatCardSkeleton() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>

      <Skeleton className="mt-6 h-8 w-28" />
      <Skeleton className="mt-3 h-3 w-36" />
    </div>
  )
}

function ContentCardSkeleton() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <Skeleton className="h-5 w-44" />
      <Skeleton className="mt-3 h-3 w-64 max-w-full" />

      <div className="mt-6 space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  )
}

export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-[#070707] text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-zinc-900 via-black to-zinc-950 p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="space-y-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-72 max-w-full" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>

            <Skeleton className="h-12 w-40 rounded-2xl" />
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({
            length: 4,
          }).map((_, index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <ContentCardSkeleton />
          <ContentCardSkeleton />
        </div>
      </div>
    </main>
  )
}