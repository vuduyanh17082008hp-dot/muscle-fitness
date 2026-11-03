import { describe, expect, it } from "vitest"

import { detectAdaptiveChange, namedWeekdays, fold } from "@/lib/dante-core/adaptive-change"
import { checkSafety } from "@/lib/dante-core/safety-layer"
import { isLimitationTurn } from "@/lib/recovery/limitation-review"
import { describeWeek, planScheduleChange } from "@/lib/training/schedule-change"

describe("detectAdaptiveChange — availability", () => {
  it.each([
    ["I can only train three days per week now.", 3, "LASTING"],
    ["I've only got time for 3 sessions a week from now on", 3, "LASTING"],
    ["My schedule changed, I can train 4 days a week", 4, "LASTING"],
    ["Change my plan to 3 days a week", 3, "LASTING"],
    ["switch me to a 4-day split", 4, "LASTING"],
    ["This week I can only make it to the gym 2 times a week", 2, "TEMPORARY"],
    ["Từ giờ mình chỉ tập được 3 buổi/tuần", 3, "LASTING"],
    ["Mỗi tuần mình chỉ tập được ba buổi thôi", 3, "LASTING"],
    ["Tuần này mình chỉ tập được 2 buổi một tuần", 2, "TEMPORARY"],
    ["Mình chỉ tập được 3 buổi/tuần, có nên đổi lịch không?", 3, "LASTING"],
  ])("%s → %i days (%s)", (message, days, temporal) => {
    expect(detectAdaptiveChange(message)).toMatchObject({ kind: "AVAILABILITY", daysPerWeek: days, temporal })
  })

  it.each([
    "Should I train 3 days a week?",
    "Is 3 days a week enough to build muscle?",
    "can I only train 3 days a week and still grow?",
    "What's a good 4 day split?",
    "Tập 3 buổi/tuần có đủ không?",
    "I trained 3 days last week",
    "I have a headache. Should I go to the gym?",
  ])("advice or unrelated, not a change: %s", (message) => {
    expect(detectAdaptiveChange(message)).toBeNull()
  })

  it("flags a correction; the newest number wins", () => {
    expect(detectAdaptiveChange("Actually, I can only train 4 days a week, not 3")).toMatchObject({ kind: "AVAILABILITY", daysPerWeek: 4, correction: true })
  })

  it("named weekdays are kept only when they match the count", () => {
    expect(detectAdaptiveChange("I can only train 3 days a week: Monday, Wednesday and Friday")).toMatchObject({ weekdays: [1, 3, 5] })
    expect(detectAdaptiveChange("I can only train 3 days a week, mostly Mondays")).toMatchObject({ weekdays: null })
    expect(namedWeekdays(fold("thứ 2, 4, 6"))).toEqual([1, 3, 5])
    expect(namedWeekdays(fold("thứ ba và chủ nhật"))).toEqual([2, 0])
  })
})

describe("detectAdaptiveChange — calorie target", () => {
  it.each([
    ["Lower my calories by 200", { mode: "DELTA", deltaKcal: -200 }],
    ["can you cut my calorie target by 150 kcal", { mode: "DELTA", deltaKcal: -150 }],
    ["add 100 kcal to my target", { mode: "DELTA", deltaKcal: 100 }],
    ["Set my calorie target to 2400", { mode: "ABSOLUTE", targetKcal: 2400 }],
    ["giảm 200 calo mỗi ngày", { mode: "DELTA", deltaKcal: -200 }],
    ["chỉnh mục tiêu calo xuống 2200 kcal", { mode: "ABSOLUTE", targetKcal: 2200 }],
    ["I skipped my workout today, should I eat less?", { mode: "REVIEW" }],
    ["Can you review my calorie target?", { mode: "REVIEW" }],
  ])("%s", (message, request) => {
    expect(detectAdaptiveChange(message)).toMatchObject({ kind: "CALORIE_TARGET", request })
  })

  it("a skipped workout is named as the reason, never as a reduction", () => {
    expect(detectAdaptiveChange("I cancelled today's workout, should I lower my calories?")).toMatchObject({ request: { mode: "REVIEW" }, reason: "TRAINING_LESS" })
  })

  it.each(["What's my calorie target?", "How many calories are in rice?", "I ate 500 calories at lunch"])("not a change request: %s", (message) => {
    expect(detectAdaptiveChange(message)).toBeNull()
  })
})

describe("planScheduleChange", () => {
  const day = (id: number, weekday: number | null = null) => ({ dayId: `00000000-0000-4000-8000-00000000000${id}`, name: `Day ${id}`, dayOrder: id, weekday })

  it("more workouts than days → rotation, every day unpinned", () => {
    const change = planScheduleChange({ trainingDays: [day(1, 1), day(2, 2), day(3, 3), day(4, 4), day(5, 5)], currentDaysPerWeek: 5, daysPerWeek: 3, weekdays: null })
    expect(change.shape).toBe("ROTATION")
    expect(change.days.map((d) => d.after)).toEqual([null, null, null, null, null])
    expect(change.unchanged).toBe(false)
  })

  it("same count → named days in plan order, else a spread week", () => {
    expect(planScheduleChange({ trainingDays: [day(1), day(2), day(3)], currentDaysPerWeek: 3, daysPerWeek: 3, weekdays: [5, 1, 3] }).days.map((d) => d.after)).toEqual([1, 3, 5])
    expect(planScheduleChange({ trainingDays: [day(1), day(2), day(3)], currentDaysPerWeek: 4, daysPerWeek: 3, weekdays: null }).days.map((d) => d.after)).toEqual([1, 3, 5])
  })

  it("a schedule that already fits is unchanged", () => {
    expect(planScheduleChange({ trainingDays: [day(1, 2), day(2, 4)], currentDaysPerWeek: 2, daysPerWeek: 2, weekdays: null }).unchanged).toBe(true)
  })

  it("describes the week Monday-first", () => {
    expect(describeWeek([{ name: "Legs", weekday: 0 }, { name: "Push", weekday: 1 }], "en")).toBe("Mon Push · Sun Legs")
    expect(describeWeek([{ name: "A", weekday: null }, { name: "B", weekday: null }], "en")).toBe("rotation: A → B")
  })
})

describe("limitation flow yields to a new concern (J3 root cause)", () => {
  it.each([
    "I have a headache. Should I go to the gym?",
    "I feel sick today, should I train?",
    "Mình bị đau đầu, có nên đi tập không?",
    "What should I eat today?",
    "I've got a cold, is it ok to lift tonight?",
  ])("%s → not a limitation turn", (message) => {
    expect(isLimitationTurn(message)).toBe(false)
  })

  it.each(["My readiness is 94, but my foot hurts. Should I train?", "what about today's workout?", "rest today", "option 2"])("%s → still the limitation flow", (message) => {
    expect(isLimitationTurn(message)).toBe(true)
  })
})

describe("red-flag headache is hard-stopped, an ordinary one is not", () => {
  it.each([
    "I have the worst headache of my life, should I train?",
    "Sudden severe headache out of nowhere, can I still lift?",
    "headache with a stiff neck and fever, gym ok?",
    "I hit my head yesterday and now I have a headache",
    "Mình đau đầu dữ dội, có tập được không?",
  ])("%s", (message) => {
    expect(checkSafety(message)).toMatchObject({ triggered: true, category: "neurological_symptoms" })
  })

  it.each(["I have a headache. Should I go to the gym?", "mild headache after work, train or rest?", "no headache today, legs feel good"])("%s → not triggered", (message) => {
    expect(checkSafety(message).triggered).toBe(false)
  })
})
