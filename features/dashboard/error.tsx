'use client'

import { useEffect } from 'react'

import Link from 'next/link'

import {
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'

type DashboardErrorProps = {
  error: Error & {
    digest?: string
  }

  reset: () => void
}

export default function DashboardError({
  error,
  reset,
}: DashboardErrorProps) {
  useEffect(() => {
    console.error(
      'Dashboard route error:',
      error,
    )
  }, [error])

  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="w-full max-w-xl rounded-3xl border border-red-400/20 bg-red-400/[0.05] p-6 text-center sm:p-8">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-red-400/20 bg-red-400/10 text-red-300">
          <AlertTriangle className="size-6" />
        </span>

        <h1 className="mt-5 text-2xl font-black text-white">
          Dashboard data could not be loaded
        </h1>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Check that the Project 08 migration has been pushed, database types have been regenerated and your Supabase session is valid.
        </p>

        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-zinc-950"
          >
            <RefreshCw className="size-4" />
            Try again
          </button>

          <Link
            href="/dashboard/today"
            className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-200"
          >
            Open today&apos;s log
          </Link>
        </div>
      </div>
    </div>
  )
}