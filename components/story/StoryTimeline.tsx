import storyData, {
  type StoryMilestone,
} from "@/data/storyContent"

export default function StoryTimeline() {
  const timeline = storyData.timeline

  return (
    <section className="bg-[#070707] px-4 py-20 text-white sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-500">
            {timeline.eyebrow}
          </p>

          <h2 className="mt-5 text-3xl font-black uppercase tracking-tight sm:text-5xl">
            {timeline.title}
          </h2>

          <p className="mt-6 text-base leading-8 text-zinc-400">
            {timeline.description}
          </p>
        </div>

        <div className="relative mt-14">
          <div
            aria-hidden="true"
            className="absolute bottom-0 left-[19px] top-0 hidden w-px bg-gradient-to-b from-amber-500 via-white/10 to-transparent sm:block"
          />

          <div className="space-y-6">
            {timeline.milestones.map(
              (
                milestone: StoryMilestone,
                idx: number,
              ) => (
                <article
                  key={`${milestone.year}-${milestone.title}`}
                  className="relative sm:pl-16"
                >
                  <div className="absolute left-0 top-7 hidden h-10 w-10 items-center justify-center rounded-full border border-amber-500/40 bg-[#0d0d0d] text-xs font-black text-amber-500 sm:flex">
                    {String(idx + 1).padStart(
                      2,
                      "0",
                    )}
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/[0.025] p-6 transition hover:border-amber-500/20 hover:bg-white/[0.04] sm:p-8">
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-500">
                      {milestone.year}
                    </p>

                    <h3 className="mt-3 text-xl font-bold text-white sm:text-2xl">
                      {milestone.title}
                    </h3>

                    <p className="mt-4 leading-7 text-zinc-400">
                      {milestone.description}
                    </p>

                    <blockquote className="mt-5 border-l border-white/20 pl-4 text-sm font-medium italic leading-6 text-zinc-300">
                      “{milestone.quote}”
                    </blockquote>
                  </div>
                </article>
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  )
}