import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import type { LucideIcon } from "lucide-react"

import {
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  CheckSquare2,
  MessageSquareText,
  Settings,
  Utensils,
  Zap,
} from "lucide-react"

import { createClient } from "@/lib/supabase/server"

type SectionConfig = {
  title: string
  description: string
  project: string
  icon: LucideIcon
}

const sections: Record<string, SectionConfig> = {
  today: {
    title: "Today",
    description:
      "Your daily focus for training, nutrition and recovery.",
    project: "Dashboard",
    icon: Zap,
  },
  nutrition: {
    title: "Nutrition",
    description:
      "Calorie and macro targets from your onboarding profile.",
    project: "Nutrition",
    icon: Utensils,
  },
  progress: {
    title: "Progress",
    description:
      "Current body metrics from your fitness profile.",
    project: "Progress",
    icon: ChartNoAxesCombined,
  },
  "check-in": {
    title: "Weekly Check-in",
    description:
      "Weekly adherence and coach review will expand here.",
    project: "Check-in",
    icon: CheckSquare2,
  },
  "ai-coach": {
    title: "AI Coach",
    description:
      "Ask training and nutrition questions with your profile context.",
    project: "AI Coach",
    icon: Bot,
  },
  messages: {
    title: "Messages",
    description:
      "Client and coach conversations will live here.",
    project: "Messages",
    icon: MessageSquareText,
  },
  calendar: {
    title: "Calendar",
    description:
      "Training days and check-ins will appear here.",
    project: "Calendar",
    icon: CalendarDays,
  },
  settings: {
    title: "Settings",
    description:
      "Update your profile through onboarding or account preferences.",
    project: "Settings",
    icon: Settings,
  },
}

type PageProps = {
  params: Promise<{
    section: string
  }>
}

function formatValue(
  value: string | number | null | undefined,
  suffix = "",
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Not set"
  }

  return `${value}${suffix}`
}

export default async function DashboardSectionPage({
  params,
}: PageProps) {
  const { section: sectionKey } = await params

  if (sectionKey === "ai-coach") {
    redirect("/ai-coach")
  }

  const section = sections[sectionKey]

  if (!section) {
    notFound()
  }

  const Icon = section.icon
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  const [
    profileResponse,
    fitnessResponse,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("fitness_profiles")
      .select(
        "weight_kg, height_cm, goal, calories_target, protein_target_g, carbs_target_g, fat_target_g, training_days, experience",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  const profile = profileResponse.data
  const fitness = fitnessResponse.data
  const displayName =
    profile?.full_name ||
    user.email?.split("@")[0] ||
    "Athlete"

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6 sm:p-8">
        <span className="inline-grid size-12 place-items-center rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] text-[var(--color-accent-light)]">
          <Icon className="size-5" />
        </span>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-light)]">
          {section.project}
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-[34px]">
          {section.title}
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          {section.description}
        </p>

        <p className="mt-4 text-sm text-zinc-500">
          Signed in as{" "}
          <span className="text-zinc-300">
            {displayName}
          </span>
        </p>
      </section>

      {(sectionKey === "nutrition" ||
        sectionKey === "today" ||
        sectionKey === "progress") && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">
              Calories
            </p>
            <p className="mt-3 text-3xl font-black text-white">
              {formatValue(fitness?.calories_target)}
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">
              Protein
            </p>
            <p className="mt-3 text-3xl font-black text-white">
              {formatValue(fitness?.protein_target_g, " g")}
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">
              Carbs
            </p>
            <p className="mt-3 text-3xl font-black text-white">
              {formatValue(fitness?.carbs_target_g, " g")}
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">
              Fat
            </p>
            <p className="mt-3 text-3xl font-black text-white">
              {formatValue(fitness?.fat_target_g, " g")}
            </p>
          </article>
        </section>
      )}

      {(sectionKey === "progress" ||
        sectionKey === "today") && (
        <section className="rounded-3xl border border-white/10 bg-[#101216] p-6">
          <h2 className="text-lg font-bold text-white">
            Current metrics
          </h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <p className="text-sm text-zinc-400">
              Weight:{" "}
              <span className="text-white">
                {formatValue(fitness?.weight_kg, " kg")}
              </span>
            </p>
            <p className="text-sm text-zinc-400">
              Height:{" "}
              <span className="text-white">
                {formatValue(fitness?.height_cm, " cm")}
              </span>
            </p>
            <p className="text-sm text-zinc-400">
              Goal:{" "}
              <span className="text-white">
                {formatValue(fitness?.goal)}
              </span>
            </p>
          </div>
        </section>
      )}

      {sectionKey === "ai-coach" && (
        <section className="rounded-3xl border border-white/10 bg-[#101216] p-6">
          <p className="text-sm leading-6 text-zinc-400">
            Use the AI Coach chat for general training and
            nutrition guidance. Responses are not medical advice.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/ai-coach"
              className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-400"
            >
              Open AI Coach chat
            </Link>
            <Link
              href="/coach"
              className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:border-white/20"
            >
              Coach overview
            </Link>
          </div>
        </section>
      )}

      {sectionKey === "settings" && (
        <section className="rounded-3xl border border-white/10 bg-[#101216] p-6">
          <p className="text-sm leading-6 text-zinc-400">
            Update personal details, goals and preferences through
            onboarding. Onboarding completed:{" "}
            <span className="text-white">
              {profile?.onboarding_completed ? "Yes" : "No"}
            </span>
          </p>

          <Link
            href="/onboarding"
            className="mt-5 inline-flex rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-400"
          >
            Edit profile
          </Link>
        </section>
      )}

      {(sectionKey === "check-in" ||
        sectionKey === "messages" ||
        sectionKey === "calendar") && (
        <section className="rounded-3xl border border-white/10 bg-[#101216] p-6">
          <p className="text-sm leading-6 text-zinc-500">
            This section is available for navigation and testing.
            Deeper logging, messaging and calendar sync will continue
            on the existing database foundation without replacing
            working auth, onboarding or workout flows.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:border-white/20"
            >
              Back to overview
            </Link>
            <Link
              href="/dashboard/workouts"
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Go to workouts
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}
