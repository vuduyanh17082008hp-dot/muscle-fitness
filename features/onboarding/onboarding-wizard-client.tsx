"use client"

import {
  useEffect,
  useState,
} from "react"

import OnboardingWizard, {
  type OnboardingWizardProps,
} from "@/features/onboarding/onboarding-wizard"

function OnboardingLoadingSkeleton() {
  return (
    <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0d0d0d] shadow-2xl shadow-black">
      <header className="border-b border-white/10 bg-gradient-to-r from-black via-zinc-900 to-black px-6 py-8 sm:px-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full">
            <div className="h-3 w-36 animate-pulse rounded-full bg-amber-500/20" />

            <div className="mt-5 h-10 w-full max-w-xl animate-pulse rounded-xl bg-white/5" />

            <div className="mt-4 h-4 w-full max-w-2xl animate-pulse rounded-full bg-white/5" />
          </div>

          <div className="hidden w-32 sm:block">
            <div className="ml-auto h-3 w-20 animate-pulse rounded-full bg-white/5" />

            <div className="ml-auto mt-3 h-4 w-28 animate-pulse rounded-full bg-white/5" />
          </div>
        </div>

        <div className="mt-7 h-1.5 animate-pulse rounded-full bg-white/5" />
      </header>

      <div className="grid gap-6 px-6 py-10 sm:grid-cols-2 sm:px-10">
        {Array.from({
          length: 6,
        }).map((_, index) => (
          <div
            key={index}
            className="space-y-3"
          >
            <div className="h-4 w-28 animate-pulse rounded-full bg-white/5" />

            <div className="h-14 animate-pulse rounded-2xl border border-white/5 bg-white/[0.025]" />
          </div>
        ))}
      </div>

      <footer className="border-t border-white/10 px-6 py-6 sm:px-10">
        <div className="ml-auto h-12 w-32 animate-pulse rounded-xl bg-amber-500/10" />
      </footer>
    </section>
  )
}

export default function OnboardingWizardClient(
  props: OnboardingWizardProps,
) {
  const [mounted, setMounted] =
    useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  /*
   * Server render và lần client render đầu tiên
   * cùng trả về một skeleton giống hệt nhau.
   *
   * Form chỉ xuất hiện sau hydration, vì vậy
   * extension không thể sửa input trước hydration.
   */
  if (!mounted) {
    return <OnboardingLoadingSkeleton />
  }

  return (
    <OnboardingWizard
      {...props}
    />
  )
}