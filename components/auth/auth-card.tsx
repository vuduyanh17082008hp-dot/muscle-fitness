import type { ReactNode } from "react"
import Link from "next/link"

type AuthCardProps = {
  title: string
  description: string
  children: ReactNode
}

export function AuthCard({
  title,
  description,
  children,
}: AuthCardProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-12 text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black" />

      <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-orange-500/10 blur-3xl" />

      <section className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-8">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-3"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-400/30 bg-orange-500/10 font-black text-orange-400">
            MF
          </span>

          <span>
            <span className="block text-sm font-black tracking-[0.25em]">
              MUSCLE FITNESS
            </span>

            <span className="text-xs text-zinc-500">
              Built through discipline
            </span>
          </span>
        </Link>

        <div className="mb-7">
          <h1 className="text-3xl font-black tracking-tight">
            {title}
          </h1>

          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {description}
          </p>
        </div>

        {children}
      </section>
    </main>
  )
}