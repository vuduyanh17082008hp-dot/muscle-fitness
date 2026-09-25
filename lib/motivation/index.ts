export type MotivationContext =
  | "RECOVERY_LOW"
  | "PLAN_ADJUSTED"
  | "STREAK_INCREASED"
  | "MILESTONE_REACHED"
  | "ADHERENCE_IMPROVED"
  | "RETURN_AFTER_MISS"
  | "REST_DAY_COMPLETED"
  | "PROGRESS_STEADY"
  | "NEW_PR"
  | "EARLY_BASELINE"

export const MOTIVATION_BANK: Record<MotivationContext, readonly string[]> = {
  RECOVERY_LOW: [
    "A lighter day done right still moves you forward.",
    "Recovery is part of the work.",
    "Today isn't about proving anything. Make the right call and keep moving.",
  ],
  PLAN_ADJUSTED: [
    "Smart training is knowing when to push and when to adjust.",
    "No ego today — execute the right session.",
    "Good athletes train hard. Better athletes know when to adapt.",
  ],
  STREAK_INCREASED: [
    "That's consistency stacking up.",
    "Another day on the board.",
    "Keep showing up. That's the part that compounds.",
  ],
  MILESTONE_REACHED: [
    "That's one more marker that you're moving forward.",
    "Small milestone. Real progress.",
    "The work is starting to add up.",
  ],
  ADHERENCE_IMPROVED: [
    "You're not just doing more — you're following the plan better.",
    "Better rhythm. Better execution.",
    "The plan works better when you keep showing up for it.",
  ],
  RETURN_AFTER_MISS: [
    "One missed day doesn't define the week. You're back.",
    "Missed one. Returned anyway. That's the important part.",
    "Back on the board. Keep moving.",
  ],
  REST_DAY_COMPLETED: [
    "Resting when the plan says rest is discipline too.",
    "Recovery done properly is still part of training.",
    "Not every productive day needs a hard session.",
  ],
  PROGRESS_STEADY: [
    "Nothing flashy. Just work compounding.",
    "Keep stacking good weeks.",
    "Progress doesn't need drama. It needs repetition.",
  ],
  NEW_PR: [
    "That one is earned. Write it down and keep building.",
    "New best. Enjoy it — then get back to work.",
    "Proof the work is moving somewhere.",
  ],
  EARLY_BASELINE: [
    "Build the baseline first. The comparisons come later.",
    "Week one is where the story starts.",
    "Give the data time to mean something.",
  ],
}

export const MOTIVATION_PREF_KEY = "mf.motivation.enabled"
export const MOTIVATION_LAST_KEY = "mf.motivation.last"

export type MotivationSelection = {
  context: MotivationContext
  line: string
  key: string
}

export type MotivationPreference = {
  enabled: boolean
  lastDate: string | null
  lastKey: string | null
}

const CONTEXT_PRIORITY: MotivationContext[] = [
  "NEW_PR",
  "MILESTONE_REACHED",
  "RETURN_AFTER_MISS",
  "STREAK_INCREASED",
  "ADHERENCE_IMPROVED",
  "REST_DAY_COMPLETED",
  "PLAN_ADJUSTED",
  "RECOVERY_LOW",
  "PROGRESS_STEADY",
  "EARLY_BASELINE",
]

function hashIndex(seed: string, modulo: number): number {
  let total = 0
  for (let index = 0; index < seed.length; index += 1) {
    total = (total + seed.charCodeAt(index) * (index + 1)) % 997
  }
  return modulo === 0 ? 0 : total % modulo
}

export function selectMotivationLine(input: {
  contexts: MotivationContext[]
  localDate: string
  preference: MotivationPreference
}): MotivationSelection | null {
  if (!input.preference.enabled) return null
  if (input.preference.lastDate === input.localDate) return null
  const context = CONTEXT_PRIORITY.find((item) => input.contexts.includes(item))
  if (!context) return null
  const bank = MOTIVATION_BANK[context]
  let index = hashIndex(`${input.localDate}:${context}`, bank.length)
  if (input.preference.lastKey === `${context}:${index}` && bank.length > 1) {
    index = (index + 1) % bank.length
  }
  return {
    context,
    line: bank[index],
    key: `${context}:${index}`,
  }
}

export function resolveProgressMotivation(input: {
  currentStreak: number
  milestoneTypes: string[]
  adherenceImproved: boolean
  restDayCompleted: boolean
  hasNewPr?: boolean
}): MotivationContext[] {
  const contexts: MotivationContext[] = []
  if (input.hasNewPr) contexts.push("NEW_PR")
  if (input.milestoneTypes.includes("RETURN_AFTER_MISS")) contexts.push("RETURN_AFTER_MISS")
  if (input.milestoneTypes.length > 0) contexts.push("MILESTONE_REACHED")
  if (input.adherenceImproved) contexts.push("ADHERENCE_IMPROVED")
  if (input.currentStreak > 0) contexts.push("STREAK_INCREASED")
  if (input.restDayCompleted) contexts.push("REST_DAY_COMPLETED")
  if (contexts.length === 0 && input.currentStreak === 0) contexts.push("EARLY_BASELINE")
  if (contexts.length === 0) contexts.push("PROGRESS_STEADY")
  return contexts
}
