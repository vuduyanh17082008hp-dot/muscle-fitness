/**
 * Synthetic demo dataset.
 *
 * Every member, visit and campaign result in this file is fictional and
 * generated deterministically from a fixed seed, so the demo renders the
 * same numbers on every request and on both server and client.
 *
 * Nothing here describes a real person or a real business outcome. The UI
 * labels this data as "Synthetic demo data" wherever it is displayed.
 */

import {
  MEMBER_GOALS,
  MEMBERSHIP_TYPES,
  type Campaign,
  type EngagementTrendPoint,
  type FacilityUsageCell,
  type GymMember,
  type MemberGoal,
  type MembershipType,
} from "@/lib/business/types"

const DEMO_SEED = 20260909

/** Small deterministic PRNG (mulberry32) — no external dependency. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]
}

function between(
  random: () => number,
  min: number,
  max: number,
): number {
  return min + random() * (max - min)
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals

  return Math.round(value * factor) / factor
}

function toInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

const FIRST_NAMES = [
  "Aisyah",
  "Benjamin",
  "Cheryl",
  "Darren",
  "Elena",
  "Farah",
  "Gabriel",
  "Hui Ling",
  "Idris",
  "Jocelyn",
  "Kenneth",
  "Lakshmi",
  "Melvin",
  "Nadia",
  "Oliver",
  "Priya",
  "Qi Xuan",
  "Rachel",
  "Samuel",
  "Tanya",
  "Umar",
  "Vivian",
  "Wei Jie",
  "Xin Yi",
  "Yusuf",
  "Zoe",
  "Adrian",
  "Bernice",
  "Clarence",
  "Dinesh",
  "Esther",
  "Farhan",
  "Grace",
  "Hakim",
] as const

const LAST_NAMES = [
  "Tan",
  "Lim",
  "Lee",
  "Wong",
  "Chen",
  "Ng",
  "Koh",
  "Rahman",
  "Menon",
  "Goh",
  "Sim",
  "Teo",
  "Yeo",
  "Nair",
  "Chua",
] as const

type SeedMember = {
  id: string
  name: string
  goal: MemberGoal
  membershipType: MembershipType
  monthlyValue: number
  joinedDaysAgo: number
  usesPersonalTraining: boolean
  preferredTime: GymMember["preferredTime"]
  signals: GymMember["signals"]
}

/**
 * Hand-authored members that anchor the demo narrative. Their signals are
 * chosen so the transparent risk engine produces the intended risk bands
 * without any hardcoded score.
 */
const NARRATIVE_MEMBERS: SeedMember[] = [
  {
    id: "mbr-alex-tan",
    name: "Alex Tan",
    goal: "Muscle gain",
    membershipType: "Annual",
    monthlyValue: 128,
    joinedDaysAgo: 412,
    usesPersonalTraining: false,
    preferredTime: "Evening",
    signals: {
      daysSinceLastVisit: 21,
      sessions30d: 4,
      sessionsPrevious30d: 11,
      workoutAdherence: 0.3,
      previousWorkoutAdherence: 0.51,
      engagementScore: 0.26,
      previousEngagementScore: 0.6,
      hasRecentProgressSignal: false,
    },
  },
  {
    id: "mbr-sarah-lim",
    name: "Sarah Lim",
    goal: "Weight loss",
    membershipType: "Monthly",
    monthlyValue: 89,
    joinedDaysAgo: 168,
    usesPersonalTraining: false,
    preferredTime: "Morning",
    signals: {
      daysSinceLastVisit: 9,
      sessions30d: 6,
      sessionsPrevious30d: 9,
      workoutAdherence: 0.55,
      previousWorkoutAdherence: 0.68,
      engagementScore: 0.48,
      previousEngagementScore: 0.62,
      hasRecentProgressSignal: false,
    },
  },
  {
    id: "mbr-marcus-lee",
    name: "Marcus Lee",
    goal: "Strength",
    membershipType: "Annual",
    monthlyValue: 128,
    joinedDaysAgo: 623,
    usesPersonalTraining: false,
    preferredTime: "Evening",
    signals: {
      daysSinceLastVisit: 1,
      sessions30d: 16,
      sessionsPrevious30d: 15,
      workoutAdherence: 0.92,
      previousWorkoutAdherence: 0.88,
      engagementScore: 0.86,
      previousEngagementScore: 0.83,
      hasRecentProgressSignal: true,
    },
  },
  {
    id: "mbr-daniel-wong",
    name: "Daniel Wong",
    goal: "General fitness",
    membershipType: "Monthly",
    monthlyValue: 89,
    joinedDaysAgo: 12,
    usesPersonalTraining: false,
    preferredTime: "Midday",
    signals: {
      daysSinceLastVisit: 4,
      sessions30d: 5,
      sessionsPrevious30d: 0,
      workoutAdherence: 0.62,
      previousWorkoutAdherence: 0,
      engagementScore: 0.71,
      previousEngagementScore: 0,
      hasRecentProgressSignal: true,
    },
  },
  {
    id: "mbr-emily-chen",
    name: "Emily Chen",
    goal: "Weight loss",
    membershipType: "Personal training",
    monthlyValue: 260,
    joinedDaysAgo: 96,
    usesPersonalTraining: true,
    preferredTime: "Morning",
    signals: {
      daysSinceLastVisit: 3,
      sessions30d: 12,
      sessionsPrevious30d: 11,
      workoutAdherence: 0.81,
      previousWorkoutAdherence: 0.76,
      engagementScore: 0.74,
      previousEngagementScore: 0.7,
      hasRecentProgressSignal: true,
    },
  },
]

const MEMBERSHIP_VALUE: Record<MembershipType, number> = {
  Monthly: 89,
  Annual: 128,
  "Class pass": 62,
  "Personal training": 260,
}

function generateMember(
  random: () => number,
  index: number,
): SeedMember {
  const firstName = pick(random, FIRST_NAMES)
  const lastName = pick(random, LAST_NAMES)
  const membershipType = pick(random, MEMBERSHIP_TYPES)
  const goal = pick(random, MEMBER_GOALS)

  /*
   * Spread members across behaviour archetypes so the base looks like a
   * real gym: a committed core, a large middle, and a drifting tail.
   */
  const archetype = random()

  let daysSinceLastVisit: number
  let sessions30d: number
  let sessionsPrevious30d: number
  let adherence: number
  let engagement: number

  if (archetype < 0.28) {
    daysSinceLastVisit = Math.round(between(random, 0, 3))
    sessions30d = Math.round(between(random, 11, 18))
    sessionsPrevious30d = Math.round(between(random, 10, 17))
    adherence = between(random, 0.74, 0.95)
    engagement = between(random, 0.68, 0.92)
  } else if (archetype < 0.68) {
    daysSinceLastVisit = Math.round(between(random, 2, 10))
    sessions30d = Math.round(between(random, 5, 11))
    sessionsPrevious30d = Math.round(between(random, 5, 12))
    adherence = between(random, 0.5, 0.78)
    engagement = between(random, 0.42, 0.72)
  } else if (archetype < 0.88) {
    daysSinceLastVisit = Math.round(between(random, 8, 20))
    sessions30d = Math.round(between(random, 2, 6))
    sessionsPrevious30d = Math.round(between(random, 5, 11))
    adherence = between(random, 0.3, 0.56)
    engagement = between(random, 0.26, 0.55)
  } else {
    daysSinceLastVisit = Math.round(between(random, 24, 58))
    sessions30d = Math.round(between(random, 0, 2))
    sessionsPrevious30d = Math.round(between(random, 3, 9))
    adherence = between(random, 0.08, 0.32)
    engagement = between(random, 0.05, 0.3)
  }

  const joinedDaysAgo = Math.round(between(random, 8, 900))

  return {
    id: `mbr-${String(index).padStart(3, "0")}`,
    name: `${firstName} ${lastName}`,
    goal,
    membershipType,
    monthlyValue: MEMBERSHIP_VALUE[membershipType],
    joinedDaysAgo,
    usesPersonalTraining: membershipType === "Personal training",
    preferredTime: pick(random, [
      "Morning",
      "Midday",
      "Evening",
      "Evening",
    ] as const),

    signals: {
      daysSinceLastVisit,
      sessions30d,
      sessionsPrevious30d,
      workoutAdherence: roundTo(adherence, 2),

      previousWorkoutAdherence: roundTo(
        Math.min(adherence + between(random, -0.08, 0.22), 0.98),
        2,
      ),

      engagementScore: roundTo(engagement, 2),

      previousEngagementScore: roundTo(
        Math.min(engagement + between(random, -0.06, 0.24), 0.98),
        2,
      ),

      hasRecentProgressSignal: random() > 0.42,
    },
  }
}

function buildDemoMembers(): GymMember[] {
  const random = createRandom(DEMO_SEED)
  const generated: SeedMember[] = []

  for (let index = 1; index <= 43; index += 1) {
    generated.push(generateMember(random, index))
  }

  return [...NARRATIVE_MEMBERS, ...generated].map((member) => ({
    ...member,
    initials: toInitials(member.name),
  }))
}

let cachedMembers: GymMember[] | null = null

export function getDemoMembers(): GymMember[] {
  if (!cachedMembers) {
    cachedMembers = buildDemoMembers()
  }

  return cachedMembers
}

export function getDemoEngagementTrend(): EngagementTrendPoint[] {
  const random = createRandom(DEMO_SEED + 7)
  const points: EngagementTrendPoint[] = []

  let engagement = 0.72
  let attendance = 640

  for (let week = 11; week >= 0; week -= 1) {
    engagement = Math.min(
      Math.max(engagement + between(random, -0.035, 0.025), 0.5),
      0.82,
    )

    attendance = Math.round(
      Math.min(
        Math.max(attendance + between(random, -48, 34), 470),
        720,
      ),
    )

    points.push({
      label: week === 0 ? "This week" : `W-${week}`,
      engagementRate: Math.round(engagement * 100),
      attendance,
      atRiskMembers: Math.round(between(random, 16, 27)),
    })
  }

  return points
}

export function getDemoFacilityUsage(): FacilityUsageCell[] {
  const random = createRandom(DEMO_SEED + 13)
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const cells: FacilityUsageCell[] = []

  for (const day of days) {
    const weekend = day === "Sat" || day === "Sun"

    for (let hour = 6; hour <= 22; hour += 1) {
      let base: number

      if (hour >= 18 && hour <= 20) {
        base = weekend ? 46 : 88
      } else if (hour >= 6 && hour <= 8) {
        base = weekend ? 52 : 71
      } else if (hour >= 13 && hour <= 15) {
        base = weekend ? 58 : 24
      } else if (hour >= 9 && hour <= 12) {
        base = weekend ? 64 : 38
      } else {
        base = weekend ? 30 : 45
      }

      cells.push({
        day,
        hour,
        utilisation: Math.round(
          Math.min(Math.max(base + between(random, -9, 9), 6), 97),
        ),
      })
    }
  }

  return cells
}

export function getDemoCampaigns(): Campaign[] {
  return [
    {
      id: "cmp-winter-return",
      name: "Seven-day return challenge",
      objective: "re-engagement",
      segmentKey: "dormant",
      status: "completed",
      createdAt: "2026-08-04T09:00:00.000Z",
      approvedAt: "2026-08-04T14:20:00.000Z",
      approvedBy: "Demo manager",
      audienceSize: 46,
      aiGenerated: true,
      source: "seed",

      content: {
        strategy:
          "Give dormant members one specific booked session rather than an open invitation. Removing the decision is the point.",
        emailSubject: "Your spot is held for Thursday, 7pm",
        emailBody:
          "We kept a place for you in Thursday's 7pm session. No catch-up needed, no plan to rebuild — just turn up and we will take it from there. Reply with a different day if Thursday does not work.",
        pushNotification:
          "Thursday 7pm is held for you. One session to get moving again.",
        callToAction: "Confirm my session",
      },

      metrics: {
        sent: 46,
        opened: 31,
        clicked: 17,
        returned: 11,
        converted: 8,
      },
    },
    {
      id: "cmp-strength-progression",
      name: "Strength progression review",
      objective: "personal-training",
      segmentKey: "pt-potential",
      status: "sent",
      createdAt: "2026-08-26T08:30:00.000Z",
      approvedAt: "2026-08-26T11:05:00.000Z",
      approvedBy: "Demo manager",
      audienceSize: 34,
      aiGenerated: true,
      source: "seed",

      content: {
        strategy:
          "This group already trains often. Lead with a technical progression review, not a discount, because frequency is not their problem.",
        emailSubject: "Your lifts have plateaued — here is why",
        emailBody:
          "You have trained consistently for eight weeks, but your top sets have not moved in three. That is usually a programming problem, not an effort problem. Book a 20-minute progression review with a coach and we will rebuild your next block around it.",
        pushNotification:
          "Lifts stalled for three weeks? Book a 20-minute progression review.",
        callToAction: "Book my review",
      },

      metrics: {
        sent: 34,
        opened: 26,
        clicked: 14,
        returned: 9,
        converted: 6,
      },
    },
    {
      id: "cmp-new-member-week-two",
      name: "New member week-two check-in",
      objective: "retention",
      segmentKey: "new-members",
      status: "approved",
      createdAt: "2026-09-02T10:15:00.000Z",
      approvedAt: "2026-09-02T16:40:00.000Z",
      approvedBy: "Demo manager",
      audienceSize: 18,
      aiGenerated: true,
      source: "seed",

      content: {
        strategy:
          "Week two is where new members quietly stop. A named coach and a fixed time beat a generic welcome sequence.",
        emailSubject: "Two weeks in — let's check the plan still fits",
        emailBody:
          "You have logged your first sessions, which is the hardest part. Before week three, let's confirm your programme still fits your week. Fifteen minutes with a coach, in person or by phone.",
        pushNotification:
          "Two weeks in. Quick check that your plan still fits your week?",
        callToAction: "Pick a time",
      },

      metrics: null,
    },
    {
      id: "cmp-midday-capacity",
      name: "Midday capacity nudge",
      objective: "member-education",
      segmentKey: "casual",
      status: "draft",
      createdAt: "2026-09-07T07:45:00.000Z",
      approvedAt: null,
      approvedBy: null,
      audienceSize: 61,
      aiGenerated: true,
      source: "seed",

      content: {
        strategy:
          "Shift a slice of evening demand into the 13:00–15:00 window by making the quiet hours the selling point.",
        emailSubject: "The gym at 2pm is a different gym",
        emailBody:
          "Every rack free, no waiting, no queue for the platform. If your schedule has any flexibility, the 13:00–15:00 window is the best training environment we have all day.",
        pushNotification:
          "Free racks, no queue: 13:00–15:00 is the quietest window today.",
        callToAction: "See quiet hours",
      },

      metrics: null,
    },
  ]
}
