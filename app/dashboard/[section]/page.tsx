import Link from "next/link"
import { notFound } from "next/navigation"

import type { LucideIcon } from "lucide-react"

import {
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  CheckSquare2,
  MessageSquareText,
  Settings,
  Zap,
} from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { SectionTabs } from "@/components/dashboard/section-tabs"
import { EmptyState } from "@/components/dashboard/empty-state"
import { PerformanceCard } from "@/components/ui/performance-card"
import DanteChat from "@/components/dante-chat"

const PROGRESS_TABS = [
  { label: "Overview", href: "/dashboard/progress#overview" },
  { label: "Strength", href: "/dashboard/training-intelligence" },
  { label: "Body", href: "/dashboard/progress#body" },
  { label: "Recovery", href: "/dashboard/recovery" },
]

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
    title: "Dante",
    description:
      "Ask training and nutrition questions with your profile context.",
    project: "Dante",
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
    <div className="mx-auto max-w-5xl space-y-6 px-1 py-2">
      {sectionKey === "progress" ? <SectionTabs tabs={PROGRESS_TABS} /> : null}

      {/* DanteChat renders its own hero (title/subtitle/quick prompts)
          when the conversation is empty — showing this generic hero
          too would be a redundant second focal point on the same
          screen, so it's skipped for ai-coach specifically. */}
      {sectionKey !== "ai-coach" ? (
        <section id="overview" className="scroll-mt-24 rounded-[20px] border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-6 sm:p-8">
          <span className="inline-grid size-14 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
            <Icon className="size-6" />
          </span>

          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
            {section.project}
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
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
      ) : null}

      {(sectionKey === "today" ||
        sectionKey === "progress") && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PerformanceCard variant="nutrition" title="Calories" metric={{ value: formatValue(fitness?.calories_target) }} />
          <PerformanceCard variant="nutrition" title="Protein" metric={{ value: formatValue(fitness?.protein_target_g, " g") }} />
          <PerformanceCard variant="nutrition" title="Carbs" metric={{ value: formatValue(fitness?.carbs_target_g, " g") }} />
          <PerformanceCard variant="nutrition" title="Fat" metric={{ value: formatValue(fitness?.fat_target_g, " g") }} />
        </section>
      )}

      {(sectionKey === "progress" ||
        sectionKey === "today") && (
        <section id="body" className="scroll-mt-24 rounded-[20px] border border-white/10 bg-[#101216] p-6">
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

      {sectionKey === "ai-coach" && <DanteChat />}

      {sectionKey === "settings" && (
        <section className="rounded-[20px] border border-white/10 bg-[#101216] p-6">
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

      {sectionKey === "check-in" && (
        <EmptyState
          icon={Icon}
          title="Weekly check-in is coming soon"
          description="A weekly adherence and coach review will live here. In the meantime, your daily recovery check-in already feeds Dante's readiness score."
          href="/dashboard/recovery"
          action="Go to daily check-in"
        />
      )}

      {sectionKey === "messages" && (
        <EmptyState
          icon={Icon}
          title="Messages are coming soon"
          description="Direct conversations with your coach will live here. Ask Dante in the meantime for training and nutrition guidance."
          href="/dashboard/ai-coach"
          action="Ask Dante"
        />
      )}

      {sectionKey === "calendar" && (
        <EmptyState
          icon={Icon}
          title="Calendar is coming soon"
          description="A unified view of training days and check-ins will live here. Your scheduled sessions are already visible in Train."
          href="/dashboard/workouts"
          action="Go to Train"
        />
      )}
    </div>
  )
}
