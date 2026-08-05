import Link from "next/link"

import { requireAdmin } from "@/lib/auth/permissions"
import { getAppRoleLabel } from "@/lib/auth/roles"

export const dynamic = "force-dynamic"

export default async function AdminHomePage() {
  const actor = await requireAdmin()

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-10 text-white sm:px-6">
      <section className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-500">
          Admin Control Center
        </p>

        <h1 className="mt-4 text-4xl font-black tracking-tight">
          Phase 1 foundation is live
        </h1>

        <p className="mt-4 text-sm leading-7 text-zinc-400">
          Role-gated admin entry point. CRM, support, billing, and AI
          product surfaces will land in later V2 phases on top of the
          entitlements and audit foundation.
        </p>

        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <dt className="text-xs uppercase tracking-[0.2em] text-zinc-600">
              Your role
            </dt>
            <dd className="mt-2 text-lg font-semibold text-amber-300">
              {getAppRoleLabel(actor.effectiveRole)}
            </dd>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <dt className="text-xs uppercase tracking-[0.2em] text-zinc-600">
              User ID
            </dt>
            <dd className="mt-2 break-all text-sm text-zinc-300">
              {actor.userId}
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:border-white/20"
          >
            Back to dashboard
          </Link>
          <Link
            href="/"
            className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-400"
          >
            Homepage
          </Link>
        </div>
      </section>
    </main>
  )
}
