import {
  Check,
  Circle,
  type LucideIcon,
} from 'lucide-react'

type ProfileChecklistRowProps = Readonly<{
  title: string
  description?: string
  completed?: boolean
  active?: boolean
  step?: number
  icon?: LucideIcon
  className?: string
}>

function joinClassNames(
  ...classNames: Array<
    string | false | null | undefined
  >
) {
  return classNames
    .filter(Boolean)
    .join(' ')
}

export function ProfileChecklistRow({
  title,
  description,
  completed = false,
  active = false,
  step,
  icon: Icon,
  className,
}: ProfileChecklistRowProps) {
  return (
    <div
      className={joinClassNames(
        'group flex items-start gap-3 rounded-2xl border px-4 py-3 transition-all duration-300',
        completed
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : active
            ? 'border-orange-500/40 bg-orange-500/10 shadow-[0_0_30px_rgba(249,115,22,0.08)]'
            : 'border-white/10 bg-white/[0.03]',
        className,
      )}
    >
      <div
        className={joinClassNames(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors',
          completed
            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
            : active
              ? 'border-orange-500/40 bg-orange-500/15 text-orange-300'
              : 'border-white/10 bg-black/20 text-zinc-500',
        )}
      >
        {completed ? (
          <Check
            className="h-4 w-4"
            aria-hidden="true"
          />
        ) : Icon ? (
          <Icon
            className="h-4 w-4"
            aria-hidden="true"
          />
        ) : step ? (
          <span className="text-xs font-black">
            {step}
          </span>
        ) : (
          <Circle
            className="h-4 w-4"
            aria-hidden="true"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p
            className={joinClassNames(
              'text-sm font-bold tracking-tight',
              completed
                ? 'text-emerald-100'
                : active
                  ? 'text-white'
                  : 'text-zinc-300',
            )}
          >
            {title}
          </p>

          {completed ? (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">
              Complete
            </span>
          ) : active ? (
            <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-orange-300">
              Current
            </span>
          ) : null}
        </div>

        {description ? (
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export default ProfileChecklistRow