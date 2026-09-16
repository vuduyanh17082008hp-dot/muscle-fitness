export default function MemberDetailLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl animate-pulse space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <div className="h-3 w-24 rounded bg-white/5" />
        <div className="h-9 w-64 rounded-xl bg-white/5" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="h-64 rounded-3xl border border-white/10 bg-white/[0.025]" />
          <div className="h-80 rounded-3xl border border-white/10 bg-white/[0.025]" />
        </div>
        <div className="h-96 rounded-3xl border border-white/10 bg-white/[0.025]" />
      </div>
    </main>
  );
}
