import type { ReactNode } from "react"
import {
  Activity,
  ArrowLeft,
  AtSign,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Ruler,
  Scale,
  ShieldCheck,
  Target,
  UserRound,
} from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getCurrentAccount } from "@/lib/auth/current-account"

export const dynamic = "force-dynamic"

type AccountPageProps = {
  searchParams: Promise<{
    updated?: string
  }>
}

type InformationItemProps = {
  icon: ReactNode
  label: string
  value: string
}

const goalLabels: Record<string, string> = {
  fat_loss: "Fat loss",
  lean_bulk: "Lean bulk",
  muscle_gain: "Muscle gain",
  body_recomposition: "Body recomposition",
  maintenance: "Maintenance",
  performance: "Performance",
}

const genderLabels: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Not provided"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

function displayValue(
  value: string | number | null | undefined,
  suffix = ""
): string {
  if (value === null || value === undefined || value === "") {
    return "Not provided"
  }

  return `${value}${suffix}`
}

function InformationItem({
  icon,
  label,
  value,
}: InformationItemProps) {
  return (
    <div className="group rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition duration-200 hover:border-amber-500/30 hover:bg-white/[0.05]">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-amber-400">
        {icon}
      </div>

      <p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-600">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-zinc-200">
        {value}
      </p>
    </div>
  )
}

export default async function AccountPage({
  searchParams,
}: AccountPageProps) {
  const account = await getCurrentAccount()

  if (!account) {
    redirect("/login?next=/account")
  }

  const params = await searchParams
  const { profile, fitnessProfile } = account

  const displayName =
    profile.full_name ||
    profile.username ||
    account.user.email?.split("@")[0] ||
    "Muscle Fitness Client"

  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "MF"

  const goal = fitnessProfile?.goal
    ? goalLabels[fitnessProfile.goal] ?? fitnessProfile.goal
    : "Not selected"

  const gender = fitnessProfile?.gender
    ? genderLabels[fitnessProfile.gender] ?? fitnessProfile.gender
    : "Not provided"

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              aria-label="Return to dashboard"
              className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft size={18} />
            </Link>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-500">
                Account centre
              </p>

              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                Your profile
              </h1>
            </div>
          </div>

          <Link
            href="/account/edit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-600 px-5 text-sm font-black text-black shadow-lg shadow-orange-950/30 transition hover:scale-[1.02] active:scale-[0.98]"
          >
            <Pencil size={16} />
            Edit profile
          </Link>
        </header>

        {params.updated === "1" && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm font-semibold text-emerald-300">
            <CheckCircle2 size={18} />
            Your profile was updated successfully.
          </div>
        )}

        <section className="mb-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.075] to-white/[0.025] shadow-2xl shadow-black/20">
          <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-600 to-red-700" />

          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
            <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 to-orange-700 text-2xl font-black text-black shadow-xl shadow-orange-950/30">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                initials
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="truncate text-2xl font-black sm:text-3xl">
                  {displayName}
                </h2>

                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
                  <ShieldCheck size={13} />
                  Authenticated
                </span>
              </div>

              <p className="mt-2 truncate text-sm text-zinc-400">
                {account.user.email ?? "No email available"}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-zinc-300">
                  Goal: {goal}
                </span>

                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-zinc-300">
                  Provider: {profile.provider ?? "email"}
                </span>

                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-zinc-300">
                  Onboarding:{" "}
                  {fitnessProfile?.onboarding_completed
                    ? "Completed"
                    : "Incomplete"}
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                <UserRound size={20} />
              </div>

              <div>
                <h2 className="font-black">Personal information</h2>
                <p className="text-xs text-zinc-500">
                  Identity and contact details
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InformationItem
                icon={<UserRound size={18} />}
                label="Full name"
                value={displayName}
              />

              <InformationItem
                icon={<AtSign size={18} />}
                label="Username"
                value={displayValue(profile.username)}
              />

              <InformationItem
                icon={<Mail size={18} />}
                label="Email"
                value={displayValue(account.user.email)}
              />

              <InformationItem
                icon={<Phone size={18} />}
                label="Phone"
                value={displayValue(profile.phone)}
              />

              <InformationItem
                icon={<CalendarDays size={18} />}
                label="Date of birth"
                value={formatDate(fitnessProfile?.date_of_birth)}
              />

              <InformationItem
                icon={<UserRound size={18} />}
                label="Gender"
                value={gender}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
                <Dumbbell size={20} />
              </div>

              <div>
                <h2 className="font-black">Fitness profile</h2>
                <p className="text-xs text-zinc-500">
                  Training and body information
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InformationItem
                icon={<Ruler size={18} />}
                label="Height"
                value={displayValue(fitnessProfile?.height_cm, " cm")}
              />

              <InformationItem
                icon={<Scale size={18} />}
                label="Weight"
                value={displayValue(fitnessProfile?.weight_kg, " kg")}
              />

              <InformationItem
                icon={<Target size={18} />}
                label="Goal"
                value={goal}
              />

              <InformationItem
                icon={<Activity size={18} />}
                label="Experience"
                value={displayValue(fitnessProfile?.experience)}
              />

              <InformationItem
                icon={<Clock3 size={18} />}
                label="Session duration"
                value={displayValue(
                  fitnessProfile?.session_duration,
                  " min"
                )}
              />

              <InformationItem
                icon={<MapPin size={18} />}
                label="Timezone"
                value={displayValue(
                  fitnessProfile?.timezone ?? "Asia/Singapore"
                )}
              />
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.025] p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-black">Account management</h2>

              <p className="mt-1 text-sm text-zinc-500">
                Update your information or securely sign out.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/account/edit"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-bold transition hover:bg-white/10"
              >
                <Pencil size={16} />
                Edit information
              </Link>

              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="h-11 rounded-xl border border-red-500/20 bg-red-500/10 px-5 text-sm font-bold text-red-300 transition hover:bg-red-500/20"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}