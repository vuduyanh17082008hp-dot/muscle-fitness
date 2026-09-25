import { resolveCanonicalMuscle, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy"

export type MuscleFocusGroup = "Chest" | "Back" | "Arms" | "Shoulders" | "Core" | "Legs"

export type MuscleFocusSnapshot = {
  groups: Array<{ label: MuscleFocusGroup; count: number; share: number }>
  mostTrained: MuscleFocusGroup | null
  leastTrained: MuscleFocusGroup | null
}

const GROUP_OF: Record<CanonicalMuscle, MuscleFocusGroup> = {
  chest: "Chest",
  upper_chest: "Chest",
  latissimus_dorsi: "Back",
  upper_back: "Back",
  trapezius: "Back",
  lower_back: "Back",
  anterior_deltoid: "Shoulders",
  lateral_deltoid: "Shoulders",
  rear_deltoid: "Shoulders",
  biceps: "Arms",
  triceps: "Arms",
  forearms: "Arms",
  abdominals: "Core",
  quadriceps: "Legs",
  hamstrings: "Legs",
  glutes: "Legs",
  calves: "Legs",
}

const ORDER: MuscleFocusGroup[] = ["Chest", "Back", "Arms", "Shoulders", "Core", "Legs"]

export function buildMuscleFocus(primaryMuscles: string[]): MuscleFocusSnapshot | null {
  if (primaryMuscles.length < 3) return null
  const counts = new Map<MuscleFocusGroup, number>(ORDER.map((label) => [label, 0]))
  let mapped = 0
  for (const raw of primaryMuscles) {
    const canonical = resolveCanonicalMuscle(raw)
    if (!canonical) continue
    const group = GROUP_OF[canonical]
    counts.set(group, (counts.get(group) ?? 0) + 1)
    mapped += 1
  }
  if (mapped < 3) return null
  const groups = ORDER.map((label) => {
    const count = counts.get(label) ?? 0
    return { label, count, share: mapped > 0 ? count / mapped : 0 }
  })
  const trained = groups.filter((group) => group.count > 0)
  if (trained.length < 2) return null
  const most = [...trained].sort((a, b) => b.count - a.count)[0]
  const least = [...trained].sort((a, b) => a.count - b.count)[0]
  return {
    groups,
    mostTrained: most?.label ?? null,
    leastTrained: least?.label ?? null,
  }
}
