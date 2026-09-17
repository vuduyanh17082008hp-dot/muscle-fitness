export default function AccountLoading() {
  return (
    <main className="min-h-screen animate-pulse bg-mf-bg px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-4">
          <div className="size-11 rounded-xl bg-white/5" />
          <div className="space-y-2">
            <div className="h-3 w-32 rounded bg-white/5" />
            <div className="h-7 w-48 rounded bg-white/5" />
          </div>
        </div>

        <div className="h-96 rounded-3xl border border-white/10 bg-white/[0.025]" />
      </div>
    </main>
  );
}
