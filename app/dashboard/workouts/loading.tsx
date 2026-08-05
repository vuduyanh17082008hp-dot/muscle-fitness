export default function WorkoutsLoading() {
  return (
    <main className="min-h-screen bg-[#070707] px-4 py-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-4 w-32 rounded bg-white/10" />

        <div className="mt-4 h-12 w-72 rounded bg-white/10" />

        <div className="mt-4 h-5 w-full max-w-xl rounded bg-white/5" />

        <div className="mt-10 h-72 rounded-3xl border border-white/10 bg-white/[0.03]" />

        <div className="mt-8 space-y-5">
          <div className="h-80 rounded-3xl border border-white/10 bg-white/[0.03]" />

          <div className="h-80 rounded-3xl border border-white/10 bg-white/[0.03]" />
        </div>
      </div>
    </main>
  );
}