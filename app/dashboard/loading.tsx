export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-5" role="status" aria-live="polite">
      <div className="h-10 w-64 rounded-xl bg-white/[0.04]" />
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-12">
        <div className="h-48 rounded-[24px] border border-mf-glass-border bg-white/[0.025] md:col-span-2 xl:col-span-8" />
        <div className="h-48 rounded-[24px] border border-mf-glass-border bg-white/[0.025] xl:col-span-4" />
        <div className="h-64 rounded-[24px] border border-mf-glass-border bg-white/[0.025] md:col-span-2 xl:col-span-7" />
        <div className="h-64 rounded-[24px] border border-mf-glass-border bg-white/[0.025] md:col-span-2 xl:col-span-5" />
      </div>
      <span className="sr-only">Loading dashboard</span>
    </div>
  );
}
