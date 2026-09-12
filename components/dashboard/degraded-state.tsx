import type { LucideIcon } from "lucide-react"
import { AlertTriangle } from "lucide-react"

import { cn } from "@/lib/cn"

/**
 * DegradedState — the fourth system state, sibling of EmptyState/
 * ErrorState/LoadingState (same visual family: dashed border box,
 * icon chip, title/description). Distinct from ErrorState: nothing
 * failed outright, but the surface is running with reduced capability
 * — e.g. "Dante unavailable, showing your last known readiness" or
 * "SetVision could not calibrate velocity, showing rep count only."
 * Amber, not rose — this is a degraded-but-working state, not a
 * failure needing a retry.
 */

type DegradedStateProps = {
  icon?: LucideIcon
  title: string
  description: string
  /** What the user is still getting despite the degradation, e.g. "Rep count and tempo are still accurate." */
  stillAvailable?: string
  className?: string
}

export function DegradedState({
  icon: Icon = AlertTriangle,
  title,
  description,
  stillAvailable,
  className,
}: DegradedStateProps) {
  return (
    <div className={cn("flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/25 bg-amber-500/[0.03] px-5 py-8 text-center", className)}>
      <span className="mb-3 grid size-11 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
        <Icon className="size-5" />
      </span>

      <h3 className="text-sm font-bold text-zinc-200">{title}</h3>

      <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">{description}</p>

      {stillAvailable ? (
        <p className="mt-3 max-w-sm text-xs leading-5 text-amber-300/80">{stillAvailable}</p>
      ) : null}
    </div>
  )
}
