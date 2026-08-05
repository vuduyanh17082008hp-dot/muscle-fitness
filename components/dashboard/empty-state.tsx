import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  href?: string
  action?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  href,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 px-5 py-8 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-500">
        <Icon className="size-5" />
      </span>

      <h3 className="text-sm font-bold text-zinc-200">
        {title}
      </h3>

      <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">
        {description}
      </p>

      {href && action ? (
        <Link
          href={href}
          className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-400/15"
        >
          {action}
        </Link>
      ) : null}
    </div>
  )
}