"use client"

import Link from "next/link"
import { AlertTriangle } from "lucide-react"

import { cn } from "@/lib/cn"

/**
 * ErrorState — sibling of EmptyState (same file, same visual family:
 * dashed border box, icon chip, title/description, optional action)
 * but for "something actually went wrong" rather than "nothing here
 * yet". Previously there was no shared error UI at all, so pages
 * either rendered nothing, a raw message, or their own bespoke box.
 */

type ErrorStateProps = {
  title?: string
  description?: string
  /** Called when the user clicks "Try again". Omit to hide the retry button. */
  onRetry?: () => void
  /** Shown instead of/alongside retry when there's somewhere better to send the user. */
  href?: string
  action?: string
  className?: string
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this right now. Please try again.",
  onRetry,
  href,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-rose-500/20 bg-rose-500/[0.03] px-5 py-8 text-center", className)}>
      <span className="mb-3 grid size-11 place-items-center rounded-xl border border-rose-400/20 bg-rose-400/10 text-rose-300">
        <AlertTriangle className="size-5" />
      </span>

      <h3 className="text-sm font-bold text-zinc-200">{title}</h3>

      <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">{description}</p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-zinc-200 transition hover:bg-white/[0.08]"
          >
            Try again
          </button>
        ) : null}

        {href && action ? (
          <Link
            href={href}
            className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-400/15"
          >
            {action}
          </Link>
        ) : null}
      </div>
    </div>
  )
}
