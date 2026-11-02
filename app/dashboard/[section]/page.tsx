import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import type { LucideIcon } from "lucide-react"

import {
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  CheckSquare2,
  ChevronRight,
  MessageSquareText,
  Settings,
  Zap,
} from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { EmptyState } from "@/components/dashboard/empty-state"
import { CalendarAgenda } from "@/components/dashboard/calendar-agenda"
import { PerformanceCard } from "@/components/ui/performance-card"
import { MotivationPreferenceToggle } from "@/components/motivation/motivation-line"
import { loadCalendarRange } from "@/lib/daily-plan/load-calendar-range"
import { loadRecoveryContext } from "@/lib/recovery/load-recovery-context"
import { loadTodaySessionRead } from "@/lib/training/load-today-session"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { buildDanteQuickActions, buildDanteTodayContext, type DanteQuickAction, type DanteTodayContext } from "@/lib/dante-core/today-context"
import { loadDailyDecision } from "@/lib/dante-core/server/load-daily-decision"
import type { SupabaseClient } from "@supabase/supabase-js"
import DanteChat from "@/components/dante-chat"

/**
 * The Dante page's Today context and quick actions — reuses the exact loaders the Dashboard and Recovery pages call and
 * the one safety decision (loadDailyDecision → trainingHold). A read that failed is reported as unavailable, never guessed.
 */
async function loadAiCoachContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ todayContext: DanteTodayContext; quickActions: DanteQuickAction[] }> {
  const now = new Date()
  const [recoveryContext, sessionRead, nutritionContext, foodLog, decision] =
    await Promise.all([
      loadRecoveryContext(supabase, userId).catch(() => null),
      loadTodaySessionRead(supabase, userId, now).catch(() => ({ status: "UNAVAILABLE" as const })),
      loadNutritionContext(supabase, userId).catch(() => null),
      loadFoodLogForDate(supabase, userId).catch(() => null),
      loadDailyDecision(supabase, userId).catch(() => null),
    ])

  const targets = nutritionContext?.targets ?? null
  const entries = foodLog?.entries ?? []
  const input = {
    now,
    localDate: recoveryContext?.current.localDate ?? foodLog?.date ?? null,
    hold: decision?.hold ?? null,
    training:
      sessionRead.status === "OK"
        ? {
            status: "ok" as const,
            session: sessionRead.session
              ? { id: sessionRead.session.id, name: sessionRead.session.name, state: sessionRead.session.sessionState }
              : null,
          }
        : { status: "unavailable" as const },
    recovery: recoveryContext
      ? {
          checkinsUnavailable: recoveryContext.checkinsUnavailable === true,
          status: recoveryContext.current.status,
          score: recoveryContext.current.score,
          recordedDate: recoveryContext.current.recordedDate,
          todayUpdatedAt: recoveryContext.today?.updated_at ?? null,
        }
      : null,
    nutrition: {
      targets: targets && targets.calories !== null && targets.protein !== null ? { calories: targets.calories, protein: targets.protein } : null,
      log: foodLog
        ? {
            unavailable: foodLog.unavailable === true,
            entries: entries.length,
            calories: foodLog.totals?.calories ?? 0,
            protein: foodLog.totals?.protein ?? 0,
            lastLoggedAt: entries.reduce<string | null>((latest, e) => (latest && latest > e.createdAt ? latest : e.createdAt), null),
          }
        : null,
    },
  }

  return { todayContext: buildDanteTodayContext(input), quickActions: buildDanteQuickActions(input) }
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 px-1 text-xs font-black uppercase tracking-[0.2em] text-mf-glass-text-muted">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-mf-glass-border bg-mf-glass-surface [&>*+*]:border-t [&>*+*]:border-mf-glass-border">
        {children}
      </div>
    </section>
  )
}

function SettingsRow({ href, title, detail }: { href: string; title: string; detail?: string }) {
  return (
    <Link href={href} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition hover:bg-white/[0.03]">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-mf-glass-text">{title}</span>
        {detail ? <span className="block text-xs leading-5 text-mf-glass-text-muted">{detail}</span> : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-mf-glass-text-muted" aria-hidden="true" />
    </Link>
  )
}

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
      "Your training journey, consistency, and comparable progress.",
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
      "Sessions and check-ins already on your plan show up here.",
    project: "Calendar",
    icon: CalendarDays,
  },
  settings: {
    title: "Settings",
    description:
      "This is not a settings screen. Profile changes live on your account page.",
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

  if (sectionKey === "check-in" || sectionKey === "messages") {
    redirect("/dashboard")
  }

  const Icon = section.icon
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/dashboard/${sectionKey}`)}`)
  }

  const [
    profileResponse,
    fitnessResponse,
    calendarDays,
    aiCoachContext,
    todayNutritionContext,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, onboarding_completed, timezone")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("fitness_profiles")
      .select(
        "weight_kg, height_cm, goal, training_days, experience",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    sectionKey === "calendar"
      ? loadCalendarRange(supabase, user.id)
      : Promise.resolve(null),
    sectionKey === "ai-coach"
      ? loadAiCoachContext(supabase, user.id)
      : Promise.resolve(null),
    // Same canonical targets the Dashboard and Dante (incl. its nutrition engine) use — never a
    // fitness_profiles column read of its own.
    sectionKey === "today"
      ? loadNutritionContext(supabase, user.id).catch(() => null)
      : Promise.resolve(null),
  ])

  const targets = todayNutritionContext?.targets ?? null

  const profile = profileResponse.data
  const fitness = fitnessResponse.data
  const displayName =
    profile?.full_name ||
    user.email?.split("@")[0] ||
    "Athlete"

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-1 py-2">
      {/* DanteChat renders its own hero (title/subtitle/quick prompts)
          when the conversation is empty — showing this generic hero
          too would be a redundant second focal point on the same
          screen, so it's skipped for ai-coach specifically. */}
      {sectionKey !== "ai-coach" ? (
        <header id="overview" className="scroll-mt-24">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-mf-glass-text-muted">
            <Icon className="size-4" aria-hidden="true" />
            {section.project}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-mf-glass-text">{section.title}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-mf-glass-text-muted">{section.description}</p>
          <p className="mt-2 text-xs text-mf-glass-text-muted">
            Signed in as <span className="text-mf-glass-text-secondary">{displayName}</span>
          </p>
        </header>
      ) : null}

      {sectionKey === "today" && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PerformanceCard glass variant="nutrition" title="Calories" metric={{ value: formatValue(targets?.calories) }} />
          <PerformanceCard glass variant="nutrition" title="Protein" metric={{ value: formatValue(targets?.protein, " g") }} />
          <PerformanceCard glass variant="nutrition" title="Carbs" metric={{ value: formatValue(targets?.carbs, " g") }} />
          <PerformanceCard glass variant="nutrition" title="Fat" metric={{ value: formatValue(targets?.fat, " g") }} />
        </section>
      )}

      {sectionKey === "today" && (
        <section id="body" className="scroll-mt-24 rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-6">
          <h2 className="text-lg font-bold text-mf-glass-text">
            Current metrics
          </h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <p className="text-sm text-mf-glass-text-muted">
              Weight:{" "}
              <span className="text-mf-glass-text">
                {formatValue(fitness?.weight_kg, " kg")}
              </span>
            </p>
            <p className="text-sm text-mf-glass-text-muted">
              Height:{" "}
              <span className="text-mf-glass-text">
                {formatValue(fitness?.height_cm, " cm")}
              </span>
            </p>
            <p className="text-sm text-mf-glass-text-muted">
              Goal:{" "}
              <span className="text-mf-glass-text">
                {formatValue(fitness?.goal)}
              </span>
            </p>
          </div>

        </section>
      )}

      {sectionKey === "ai-coach" && (
        // Persistent "Dante learned" pattern memory is intentionally not
        // mounted on the Phase 2C chat surface — that table/migration is
        // optional adaptive-intelligence work, not required for chat UX.
        <DanteChat
          todayContext={aiCoachContext?.todayContext}
          quickPrompts={aiCoachContext?.quickActions}
          restoreHistory
        />
      )}

      {sectionKey === "settings" && (
        // Every row is an existing destination or action — no preference here without a working implementation behind it.
        <div className="space-y-6">
          <SettingsGroup title="Account">
            <SettingsRow href="/account/edit" title="Profile" detail="Name, username, phone, date of birth" />
            <SettingsRow
              href="/account/edit"
              title="Time zone"
              detail={profile?.timezone ? `${profile.timezone} — sets which day your logs count toward` : "Not set — days follow UTC until you choose one"}
            />
            <SettingsRow href="/account" title="Account overview" detail="Your details and fitness profile at a glance" />
          </SettingsGroup>

          <SettingsGroup title="Training & nutrition">
            <SettingsRow
              href="/onboarding?edit=1"
              title="Training profile"
              detail={profile?.onboarding_completed ? "Goal, experience, training days, body metrics" : "Not finished — complete it to get a plan"}
            />
            <SettingsRow href="/dashboard/nutrition/plan" title="Nutrition plan & targets" detail="Training mode, activity level, goal, weekly food budget" />
          </SettingsGroup>

          <SettingsGroup title="Coaching">
            <div className="px-4 pb-1">
              <MotivationPreferenceToggle />
              <p className="px-1 pt-2 text-xs text-mf-glass-text-muted">Saved on this device only.</p>
            </div>
          </SettingsGroup>

          {/* No password row: signed-in users are redirected away from /forgot-password and there is no in-app change. */}
          <SettingsGroup title="Session">
            <form action="/auth/signout" method="post">
              <button type="submit" className="flex min-h-14 w-full items-center px-4 text-left text-sm font-semibold text-mf-status-danger transition hover:bg-white/[0.03]">
                Sign out
              </button>
            </form>
          </SettingsGroup>

          <SettingsGroup title="Privacy & legal">
            <SettingsRow href="/privacy" title="Privacy policy" />
            <SettingsRow href="/terms" title="Terms of service" />
            <SettingsRow href="/responsible-ai" title="Responsible AI" detail="How Dante uses your data and where its limits are" />
          </SettingsGroup>
        </div>
      )}

      {sectionKey === "check-in" && (
        <EmptyState
          glass
          icon={Icon}
          title="Weekly check-in is coming soon"
          description="A weekly adherence and coach review will live here. In the meantime, your daily recovery check-in already feeds Dante's readiness score."
          href="/dashboard/recovery"
          action="Go to daily check-in"
        />
      )}

      {sectionKey === "messages" && (
        <EmptyState
          glass
          icon={Icon}
          title="Messages are coming soon"
          description="Direct conversations with your coach will live here. Ask Dante in the meantime for training and nutrition guidance."
          href="/dashboard/ai-coach"
          action="Ask Dante"
        />
      )}

      {sectionKey === "calendar" && (
        calendarDays && calendarDays.some((day) => day.actions.length > 0) ? (
          <CalendarAgenda days={calendarDays} timeZone={profile?.timezone || "UTC"} />
        ) : (
          <EmptyState
            glass
            icon={Icon}
            title="Nothing scheduled yet"
            description="Planned workouts and daily check-ins will appear here once you build a training plan."
            href="/dashboard/workouts/plans/new"
            action="Build a plan"
          />
        )
      )}
    </div>
  )
}
