import type { ReactNode } from "react"

import { PlannerFigure } from "@/components/brand/athletic-figures"
import { Wordmark } from "@/components/brand/wordmark"

type AuthShellProps = {
  eyebrow: string
  title: string
  description: string
  sideTitle: string
  sideDescription: string
  step: string
  children: ReactNode
}

export function AuthShell({
  eyebrow,
  title,
  description,
  sideTitle,
  sideDescription,
  step,
  children,
}: AuthShellProps) {
  return (
    // Iron & Paper: plain paper page, no glow blobs (they also held a 600px+ layer at 320px).
    <main data-theme="paper" className="relative min-h-screen bg-mf-glass-bg text-mf-glass-text">

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(440px,560px)]">
        <section className="hidden min-h-screen flex-col justify-between border-r border-mf-glass-border bg-mf-glass-bg-deep p-10 lg:flex xl:p-14">
          <Wordmark />

          <div className="max-w-2xl">
            <div className="mb-7 flex items-center gap-4">
              <span className="rounded bg-mf-glass-text px-2 py-1 text-xs font-bold tracking-[0.12em] text-mf-glass-bg">
                {step}
              </span>

              <span className="h-0.5 w-20 bg-mf-glass-text" />

              <span className="text-xs font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">
                Secure access
              </span>
            </div>

            <PlannerFigure className="mb-6 size-40" />

            <h2 className="max-w-xl font-heading text-6xl font-black uppercase leading-[0.92] tracking-tight xl:text-7xl">
              {sideTitle}
            </h2>

            <p className="mt-7 max-w-xl text-base leading-8 text-mf-glass-text-secondary">
              {sideDescription}
            </p>

            <div className="mt-12 grid max-w-xl grid-cols-3 gap-3">
              <Feature value="01" label="Private data" />
              <Feature value="02" label="Secure session" />
              <Feature value="03" label="Personal plan" />
            </div>
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">Muscle Fitness</p>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 lg:px-10">
          <div className="w-full max-w-md">
            <Wordmark className="mb-8 lg:hidden" />

            <div className="rounded-2xl border-2 border-mf-glass-text bg-mf-glass-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
              <div className="mb-8">
                <div className="mb-4 flex items-center gap-3">
                  <span className="h-0.5 w-8 bg-mf-glass-text" />

                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-mf-glass-text-secondary">
                    {eyebrow}
                  </p>
                </div>

                <h1 className="font-heading text-4xl font-black uppercase tracking-tight sm:text-5xl">
                  {title}
                </h1>

                <p className="mt-4 text-sm leading-7 text-mf-glass-text-secondary">
                  {description}
                </p>
              </div>

              {children}
            </div>

            
          </div>
        </section>
      </div>
    </main>
  )
}

function Feature({
  value,
  label,
}: {
  value: string
  label: string
}) {
  return (
    <div className="rounded-xl border border-mf-glass-border bg-mf-glass-surface p-4">
      <p className="font-heading text-2xl font-black text-mf-glass-text">
        {value}
      </p>

      <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">
        {label}
      </p>
    </div>
  )
}