export default function NutritionLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl animate-pulse space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <div className="h-3 w-28 rounded bg-white/5" />
        <div className="h-10 w-72 rounded-xl bg-white/5" />
        <div className="h-9 w-full max-w-md rounded-full bg-white/5" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-32 rounded-3xl border border-mf-glass-border bg-white/[0.025]"
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-96 rounded-3xl border border-mf-glass-border bg-white/[0.025]" />
        <div className="h-96 rounded-3xl border border-mf-glass-border bg-white/[0.025]" />
      </div>
    </main>
  );
}
