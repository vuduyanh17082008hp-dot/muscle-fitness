import storyData from "@/data/storyContent"

export default function StoryLidentity() {
  const identity = storyData.identity

  return (
    <section className="relative overflow-hidden border-y border-white/10 bg-[#090909] px-4 py-20 text-white sm:px-6 lg:px-8 lg:py-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.13),transparent_42%)]"
      />

      <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-500">
            Identity
          </p>

          <p className="mt-5 text-7xl font-black uppercase leading-none text-white/5 sm:text-8xl">
            Why
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-500">
            {identity.eyebrow}
          </p>

          <h2 className="mt-5 text-3xl font-black uppercase leading-tight tracking-tight text-white sm:text-5xl">
            {identity.title}
          </h2>

          <p className="mt-6 max-w-3xl text-base leading-8 text-zinc-400 sm:text-lg">
            {identity.description}
          </p>

          <blockquote className="mt-8 border-l-2 border-amber-500 pl-6 text-lg font-semibold italic leading-8 text-zinc-200">
            “{identity.quote}”
          </blockquote>
        </div>
      </div>
    </section>
  )
}