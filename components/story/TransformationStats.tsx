"use client"

import {
  useEffect,
  useState,
} from "react"

import storyData, {
  type StoryStat,
} from "@/data/storyContent"

export default function TransformationStats() {
  const stats = storyData.stats

  const [counts, setCounts] =
    useState<number[]>(
      () => stats.map(() => 0),
    )

  useEffect(() => {
    const timers: Array<
      ReturnType<typeof setInterval>
    > = []

    stats.forEach(
      (
        stat: StoryStat,
        index: number,
      ) => {
        const duration = 900
        const totalSteps = 30
        const increment =
          stat.value / totalSteps

        let currentValue = 0

        const timer = setInterval(() => {
          currentValue += increment

          const nextValue = Math.min(
            stat.value,
            Math.round(currentValue),
          )

          setCounts(
            (
              previousCounts: number[],
            ) => {
              const nextCounts = [
                ...previousCounts,
              ]

              nextCounts[index] =
                nextValue

              return nextCounts
            },
          )

          if (
            nextValue >= stat.value
          ) {
            clearInterval(timer)
          }
        }, duration / totalSteps)

        timers.push(timer)
      },
    )

    return () => {
      timers.forEach((timer) => {
        clearInterval(timer)
      })
    }
  }, [stats])

  return (
    <section className="bg-[#070707] px-4 py-20 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(
            (
              stat: StoryStat,
              index: number,
            ) => (
              <article
                key={stat.label}
                className="rounded-[24px] border border-white/10 bg-white/[0.025] p-6 transition hover:border-amber-500/20 hover:bg-white/[0.04]"
              >
                <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-600">
                  {stat.label}
                </p>

                <p className="mt-4 text-4xl font-black text-white">
                  {counts[index] ?? 0}

                  <span className="text-amber-500">
                    {stat.suffix}
                  </span>
                </p>

                <p className="mt-4 text-sm leading-6 text-zinc-500">
                  {stat.description}
                </p>
              </article>
            ),
          )}
        </div>
      </div>
    </section>
  )
}