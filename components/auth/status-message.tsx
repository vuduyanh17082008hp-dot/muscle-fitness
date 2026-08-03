type StatusMessageProps = {
  type: "success" | "error" | "info"
  children: React.ReactNode
}

const styles = {
  success:
    "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
  error:
    "border-red-400/20 bg-red-500/10 text-red-200",
  info:
    "border-sky-400/20 bg-sky-500/10 text-sky-200",
}

export function StatusMessage({
  type,
  children,
}: StatusMessageProps) {
  return (
    <div
      aria-live={type === "error" ? "assertive" : "polite"}
      className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${styles[type]}`}
    >
      {children}
    </div>
  )
}