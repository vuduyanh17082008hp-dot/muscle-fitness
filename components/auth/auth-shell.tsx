import type { ReactNode } from "react"
import Link from "next/link"

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
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(249,115,22,0.14),transparent_30%),radial-gradient(circle_at_90%_90%,rgba(239,68,68,0.08),transparent_28%),linear-gradient(135deg,#050505,#090909_55%,#030303)]" />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="pointer-events-none absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-orange-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-red-500/10 blur-[130px]" />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(440px,560px)]">
        <section className="hidden min-h-screen flex-col justify-between border-r border-white/10 p-10 lg:flex xl:p-14">
          <Link href="/" className="inline-flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-400/30 bg-orange-500/10 text-sm font-black text-orange-400 shadow-[0_0_40px_rgba(249,115,22,0.12)]">
              MF
            </span>

            <span>
              <span className="block text-sm font-black tracking-[0.28em]">
                MUSCLE FITNESS
              </span>

              <span className="mt-1 block text-xs text-zinc-600">
                Built through discipline
              </span>
            </span>
          </Link>

          <div className="max-w-2xl">
            <div className="mb-7 flex items-center gap-4">
              <span className="text-xs font-black tracking-[0.3em] text-orange-400">
                {step}
              </span>

              <span className="h-px w-20 bg-gradient-to-r from-orange-400 to-transparent" />

              <span className="text-xs font-bold uppercase tracking-[0.28em] text-zinc-600">
                Secure access
              </span>
            </div>

            <h2 className="max-w-xl text-6xl font-black uppercase leading-[0.92] tracking-[-0.055em] xl:text-7xl">
              {sideTitle}
            </h2>

            <p className="mt-7 max-w-xl text-base leading-8 text-zinc-500">
              {sideDescription}
            </p>

            <div className="mt-12 grid max-w-xl grid-cols-3 gap-3">
              <Feature value="01" label="Private data" />
              <Feature value="02" label="Secure session" />
              <Feature value="03" label="Personal plan" />
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-700">
            <span>Muscle Fitness System</span>
            <span>Authentication 05</span>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 lg:px-10">
          <div className="w-full max-w-md">
            <Link
              href="/"
              className="mb-8 inline-flex items-center gap-3 lg:hidden"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-400/30 bg-orange-500/10 text-sm font-black text-orange-400">
                MF
              </span>

              <span className="text-xs font-black tracking-[0.25em]">
                MUSCLE FITNESS
              </span>
            </Link>

            <div className="rounded-[32px] border border-white/10 bg-zinc-950/75 p-6 shadow-[0_32px_100px_rgba(0,0,0,0.65)] backdrop-blur-2xl sm:p-8">
              <div className="mb-8">
                <div className="mb-4 flex items-center gap-3">
                  <span className="h-px w-8 bg-orange-400" />

                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-400">
                    {eyebrow}
                  </p>
                </div>

                <h1 className="text-3xl font-black uppercase tracking-[-0.04em] sm:text-4xl">
                  {title}
                </h1>

                <p className="mt-4 text-sm leading-7 text-zinc-500">
                  {description}
                </p>
              </div>

              {children}
            </div>

            <p className="mt-6 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">
              Encrypted session · Secure authentication
            </p>
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <p className="text-2xl font-black text-zinc-700">
        {value}
      </p>

      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
    </div>
  )
}