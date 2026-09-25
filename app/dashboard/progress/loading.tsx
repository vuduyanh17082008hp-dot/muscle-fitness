export default function ProgressLoading() {
  return (
    <div className="mx-auto max-w-[1180px] space-y-5" aria-busy="true" aria-label="Loading progress">
      <div className="h-10 rounded-xl bg-[#0a1622]" />
      <div className="h-72 animate-pulse rounded-[22px] border border-[#15243a] bg-[#0a1622]" />
      <div className="h-56 animate-pulse rounded-[22px] border border-[#15243a] bg-[#0a1622]" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-[22px] border border-[#15243a] bg-[#0a1622]" />
        <div className="h-64 animate-pulse rounded-[22px] border border-[#15243a] bg-[#0a1622]" />
      </div>
    </div>
  )
}
