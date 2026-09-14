import type { ReactNode } from "react"

import { Logo } from "@/components/brand/logo"

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

      <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-[var(--mf-brand)]/8 blur-3xl" />

      <section className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-8">
        <Logo className="mb-8" showTextOnMobile tagline="Built through discipline" />

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