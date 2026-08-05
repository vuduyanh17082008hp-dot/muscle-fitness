import type { ReactNode } from "react"

export type LoadingStateProps = {
  label?: ReactNode
  title?: ReactNode
  message?: ReactNode
  description?: ReactNode
  fullScreen?: boolean
  compact?: boolean
  className?: string
}

function joinClassNames(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ")
}

export function LoadingState({
  label,
  title,
  message,
  description,
  fullScreen = false,
  compact = false,
  className,
}: LoadingStateProps) {
  const displayLabel =
    label ??
    title ??
    message ??
    "Đang tải..."

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={joinClassNames(
        "flex w-full items-center justify-center bg-[#070707] text-white",
        fullScreen
          ? "min-h-screen"
          : compact
            ? "min-h-32"
            : "min-h-[320px]",
        className,
      )}
    >
      <section
        className={joinClassNames(
          "relative overflow-hidden border border-white/10",
          "bg-gradient-to-br from-[#141414] via-[#0d0d0d] to-black",
          "text-center shadow-2xl shadow-black/70",
          compact
            ? "w-full max-w-sm rounded-2xl px-5 py-6"
            : "w-full max-w-lg rounded-[28px] px-8 py-12",
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.13),transparent_55%)]"
        />

        <div className="relative">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/[0.06]">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-2 border-white/10" />

              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-r-amber-500 border-t-amber-500" />

              <div className="absolute inset-[10px] animate-pulse rounded-full bg-amber-500/30 shadow-[0_0_24px_rgba(245,158,11,0.35)]" />
            </div>
          </div>

          <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-amber-500">
            Muscle Fitness
          </p>

          <h2
            className={joinClassNames(
              "mt-3 font-bold tracking-tight text-white",
              compact ? "text-base" : "text-xl",
            )}
          >
            {displayLabel}
          </h2>

          {description ? (
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-500">
              {description}
            </p>
          ) : null}

          <div className="mx-auto mt-7 flex max-w-xs gap-2">
            <div className="h-1 flex-1 animate-pulse rounded-full bg-amber-500" />
            <div className="h-1 flex-1 animate-pulse rounded-full bg-amber-500/50 [animation-delay:150ms]" />
            <div className="h-1 flex-1 animate-pulse rounded-full bg-amber-500/20 [animation-delay:300ms]" />
          </div>

          <span className="sr-only">
            {typeof displayLabel === "string"
              ? displayLabel
              : "Đang tải"}
          </span>
        </div>
      </section>
    </div>
  )
}

export default LoadingState