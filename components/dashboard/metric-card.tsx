import Link from 'next/link'

import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight } from 'lucide-react'

import { progressPercentage } from '@/features/dashboard/calculations'

type MetricCardProps = {
  title: string
  value: number | null
  target: number | null
  unit: string
  icon: LucideIcon
  href: string
  secondary?: string
  fractionDigits?: number
}

function formatNumber(
  value: number,
  maximumFractionDigits = 0,
) {
  return new Intl.NumberFormat(
    'en-SG',
    {
      maximumFractionDigits,
    },
  ).format(value)
}

export function MetricCard({
  title,
  value,
  target,
  unit,
  icon: Icon,
  href,
  secondary,
  fractionDigits = 0,
}: MetricCardProps) {
  const hasData =
    value !== null

  const hasTarget =
    target !== null &&
    target > 0

  const percentage =
    hasData &&
    hasTarget
      ? progressPercentage(
          value,
          target,
        )
      : 0

  return (
    <article className="rounded-2xl border border-white/10 bg-[#101216] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300">
          <Icon className="size-4" />
        </span>

        <Link
          href={href}
          aria-label={`Open ${title}`}
          className="grid size-8 place-items-center rounded-lg text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-200"
        >
          <ArrowUpRight className="size-4" />
        </Link>
      </div>

      <p className="mt-5 text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">
        {title}
      </p>

      {hasData ? (
        <>
          <div className="mt-2 flex items-end gap-1.5">
            <strong className="text-2xl font-black tracking-tight text-white">
              {formatNumber(
                value,
                fractionDigits,
              )}
            </strong>

            <span className="pb-1 text-xs font-semibold text-zinc-500">
              {unit}
            </span>
          </div>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-200 transition-[width]"
              style={{
                width: `${percentage}%`,
              }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-zinc-500">
            <span>
              {hasTarget
                ? `${percentage}% of target`
                : 'Target not set'}
            </span>

            <span>
              {hasTarget
                ? `${formatNumber(
                    target,
                    fractionDigits,
                  )} ${unit}`
                : secondary}
            </span>
          </div>

          {secondary && hasTarget ? (
            <p className="mt-3 border-t border-white/[0.06] pt-3 text-xs text-zinc-400">
              {secondary}
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-5">
          <strong className="text-2xl font-black text-zinc-600">
            —
          </strong>

          <p className="mt-2 text-xs leading-5 text-zinc-500">
            No data logged for today.
          </p>

          <Link
            href="/dashboard/today"
            className="mt-3 inline-flex text-xs font-bold text-amber-300 hover:text-amber-200"
          >
            Log today&apos;s data
          </Link>
        </div>
      )}
    </article>
  )
}