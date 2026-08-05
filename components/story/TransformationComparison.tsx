import storyData, {
  type TransformationSide,
} from "@/data/storyContent"

function TransformationPanel({
  side,
  emphasized = false,
}: {
  side: TransformationSide
  emphasized?: boolean
}) {
  return (
    <article
      className={
        emphasized
          ? "rounded-[28px] border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-[#101010] to-black p-7 shadow-2xl shadow-amber-950/20 sm:p-9"
          : "rounded-[28px] border border-white/10 bg-[#0d0d0d] p-7 sm:p-9"
      }
    >
      <div className="flex items-start justify-between gap-5">
        <div>
          <p
            className={
              emphasized
                ? "text-xs font-black uppercase tracking-[0.3em] text-amber-500"
                : "text-xs font-black uppercase tracking-[0.3em] text-zinc-600"
            }
          >
            {side.label}
          </p>

          <h3 className="mt-3 text-2xl font-black uppercase text-white">
            {side.title}
          </h3>
        </div>

        <p
          className={
            emphasized
              ? "text-4xl font-black text-amber-500"
              : "text-4xl font-black text-zinc-500"
          }
        >
          {side.weight}
        </p>
      </div>

      <p className="mt-5 leading-7 text-zinc-400">
        {side.description}
      </p>

      <ul className="mt-7 space-y-3">
        {side.traits.map(
          (trait: string) => (
            <li
              key={trait}
              className="flex gap-3 text-sm leading-6 text-zinc-300"
            >
              <span
                aria-hidden="true"
                className={
                  emphasized
                    ? "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                    : "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600"
                }
              />

              <span>{trait}</span>
            </li>
          ),
        )}
      </ul>
    </article>
  )
}

export default function TransformationComparison() {
  const transformation =
    storyData.transformation

  return (
    <section className="border-y border-white/10 bg-black px-4 py-20 text-white sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-500">
            {transformation.eyebrow}
          </p>

          <h2 className="mt-5 text-3xl font-black uppercase tracking-tight sm:text-5xl">
            {transformation.title}
          </h2>

          <p className="mt-6 leading-8 text-zinc-400">
            {transformation.description}
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <TransformationPanel
            side={transformation.before}
          />

          <TransformationPanel
            side={transformation.after}
            emphasized
          />
        </div>
      </div>
    </section>
  )
}