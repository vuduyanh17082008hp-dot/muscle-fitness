import { notFound } from 'next/navigation'

import type { LucideIcon } from 'lucide-react'

import {
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  CheckSquare2,
  Dumbbell,
  MessageSquareText,
  Settings,
  Utensils,
} from 'lucide-react'

type Section = {
  title: string
  description: string
  project: string
  icon: LucideIcon
}

const sections: Record<
  string,
  Section
> = {
  workouts: {
    title: 'Workouts',

    description:
      'Training plans, exercise sessions and workout logging will live here.',

    project:
      'Project 09',

    icon:
      Dumbbell,
  },

  nutrition: {
    title: 'Nutrition',

    description:
      'Meal plans, food logging and macro details will live here.',

    project:
      'Project 10',

    icon:
      Utensils,
  },

  progress: {
    title: 'Progress',

    description:
      'Weight, measurements, photos and performance trends will live here.',

    project:
      'Project 11',

    icon:
      ChartNoAxesCombined,
  },

  'check-in': {
    title:
      'Weekly Check-in',

    description:
      'Weekly adherence, feedback and coach review will live here.',

    project:
      'Project 12',

    icon:
      CheckSquare2,
  },

  'ai-coach': {
    title:
      'AI Coach',

    description:
      'Authenticated coaching based on real client data will live here.',

    project:
      'Project 13',

    icon:
      Bot,
  },

  messages: {
    title:
      'Messages',

    description:
      'Secure client and coach conversations will live here.',

    project:
      'Project 17',

    icon:
      MessageSquareText,
  },

  calendar: {
    title:
      'Calendar',

    description:
      'Training, check-ins and coaching events will live here.',

    project:
      'Project 18',

    icon:
      CalendarDays,
  },

  settings: {
    title:
      'Settings',

    description:
      'Profile, targets, preferences, security and account controls will live here.',

    project:
      'Settings module',

    icon:
      Settings,
  },
}

type DashboardSectionPageProps = {
  params: Promise<{
    section: string
  }>
}

export default async function DashboardSectionPage({
  params,
}: DashboardSectionPageProps) {
  const {
    section: sectionKey,
  } = await params

  const section =
    sections[sectionKey]

  if (!section) {
    notFound()
  }

  const Icon =
    section.icon

  return (
    <div className="grid min-h-[72vh] place-items-center">
      <section className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#101216] p-6 text-center sm:p-10">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
          <Icon className="size-7" />
        </span>

        <p className="mt-6 text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
          {section.project}
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
          {section.title}
        </h1>

        <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-zinc-500">
          {section.description}
        </p>

        <p className="mx-auto mt-5 max-w-lg rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3 text-xs leading-5 text-zinc-600">
          This route is active so the dashboard navigation does not return a 404 while the next projects are still being developed.
        </p>
      </section>
    </div>
  )
}