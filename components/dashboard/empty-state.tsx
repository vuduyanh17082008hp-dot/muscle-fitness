import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/cn'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  href?: string
  action?: string
  className?: string
  /** Render on the Performance Glass (near-black + lime) dashboard tokens instead of the legacy Ocean Sunset ones. Default false — the business portal keeps its current look. */
  glass?: boolean
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  href,
  action,
  className,
  glass = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-8 text-center",
        glass ? "border-mf-glass-border bg-mf-glass-bg-deep" : "border-white/10 bg-black/20",
        className,
      )}
    >
      <span
        className={cn(
          "mb-3 grid size-11 place-items-center rounded-xl border bg-white/[0.04]",
          glass ? "border-mf-glass-border text-mf-glass-text-muted" : "border-white/10 text-zinc-500",
        )}
      >
        <Icon className="size-5" />
      </span>

      <h3 className={cn("text-sm font-bold", glass ? "text-mf-glass-text-secondary" : "text-zinc-200")}>
        {title}
      </h3>

      <p className={cn("mt-1 max-w-sm text-xs leading-5", glass ? "text-mf-glass-text-muted" : "text-zinc-500")}>
        {description}
      </p>

      {href && action ? (
        <Link
          href={href}
          className={cn(
            "mt-4 rounded-lg border px-3 py-2 text-xs font-bold transition",
            glass
              ? "border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand hover:bg-mf-glass-brand-soft"
              : "border-amber-400/20 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15",
          )}
        >
          {action}
        </Link>
      ) : null}
    </div>
  )
}