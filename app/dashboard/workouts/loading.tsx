export default function WorkoutsLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl animate-pulse space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <div className="h-3 w-28 rounded bg-white/5" />
        <div className="h-10 w-72 rounded-xl bg-white/5" />
        <div className="h-4 w-full max-w-xl rounded bg-white/5" />
      </div>

      <div className="h-72 rounded-3xl border border-white/5 bg-white/[0.025]" />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-44 rounded-3xl border border-white/5 bg-white/[0.025]"
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-96 rounded-3xl border border-white/5 bg-white/[0.025]" />
        <div className="h-96 rounded-3xl border border-white/5 bg-white/[0.025]" />
      </div>
    </main>
  )
}