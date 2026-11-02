/**
 * MF-S1 H1 "Your user changed": what the CURRENT message says has changed, read from the user's own words.
 *
 * Only a first-person report of a change ("I can only train 3 days a week now") or an explicit change request
 * ("lower my calories by 200") becomes a change. A question ABOUT a change ("is 3 days a week enough?") is a request
 * for advice and stays with the model. Nothing here reads history: the newest statement governs, and a correction
 * ("actually, 4 days") is just a newer statement that is flagged as one.
 *
 * ponytail: cue lists over folded text (same ceiling as performance-core/context-working-set.ts); the upgrade path is a
 * classifier that emits this same shape.
 */

export type ChangeTemporal = "TEMPORARY" | "LASTING"

export type CalorieRequest = { mode: "DELTA"; deltaKcal: number } | { mode: "ABSOLUTE"; targetKcal: number } | { mode: "REVIEW" }

export type AdaptiveChange =
  | { kind: "AVAILABILITY"; daysPerWeek: number; weekdays: number[] | null; temporal: ChangeTemporal; correction: boolean }
  | { kind: "CALORIE_TARGET"; request: CalorieRequest; reason: "TRAINING_LESS" | "REST_DAY" | null; correction: boolean }

export const fold = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[’`]/g, "'")

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, mot: 1, hai: 2, ba: 3, bon: 4, nam: 5, sau: 6, bay: 7 }
const N = "(\\d|one|two|three|four|five|six|seven|mot|hai|ba|bon|nam|sau|bay)"
const PER_WEEK_EN = `\\s*(?:x\\s*)?(?:days?|times?|sessions?|workouts?|gym days?)\\s*(?:a|per|each|every|\\/|in a)\\s*week`
const PER_WEEK_VI = `\\s*(?:buoi|ngay|lan)(?:\\s*tap)?\\s*(?:\\/\\s*|(?:moi|mot|1|trong|mot)\\s+)tuan`

const AVAILABILITY: RegExp[] = [
  // "I can only train three days per week now", "I've only got time for 3 sessions a week"
  new RegExp(`\\b(?:only|just)\\b[^.?!]{0,32}?\\b${N}${PER_WEEK_EN}`),
  // "I can train 4 days a week from now on", "my schedule changed, I'll have 3 gym days a week"
  new RegExp(`\\b(?:i can|i could|i'?ll|i will|i'?m able to|i have time (?:to|for)|i'?ve got time for|i got time for|i have|now i can|i can now|my (?:new )?schedule (?:is|allows|only allows)|my schedule changed)\\b[^.?!]{0,32}?\\b${N}${PER_WEEK_EN}`),
  // "change my plan to 3 days a week", "switch me to a 3-day split", "make my program 4 days"
  new RegExp(`\\b(?:change|switch|move|make|set|cut|drop|reduce|adjust|update|put)\\b[^.?!]{0,28}?\\b(?:plan|program|programme|schedule|split|training|routine|me|it)\\b[^.?!]{0,16}?\\b(?:to|into)\\s+(?:a\\s+)?${N}\\s*(?:-\\s*)?(?:days?|sessions?|times?|day split)\\b`),
  // VI: "từ giờ mình chỉ tập được 3 buổi/tuần", "mỗi tuần chỉ tập được 3 buổi", "đổi lịch tập thành 3 buổi"
  new RegExp(`\\b(?:chi|chi co the|chi tap duoc|tap duoc|co the tap)\\b[^.?!]{0,24}?\\b${N}${PER_WEEK_VI}`),
  new RegExp(`\\b(?:moi|mot|1) tuan\\b[^.?!]{0,8}?\\b(?:chi|chi co the|tap duoc|co the tap|chi tap)\\b[^.?!]{0,16}?\\b${N}\\s*(?:buoi|ngay|lan)\\b`),
  new RegExp(`\\b(?:doi|chuyen|giam|sua|chinh)\\b[^.?!]{0,24}?\\b(?:lich|ke hoach|giao an|chuong trinh)\\b[^.?!]{0,20}?\\b(?:thanh|xuong|con|ve|sang)\\s+${N}\\s*(?:buoi|ngay)\\b`),
]

/** A question about a schedule, not a report of one: "Should I train 3 days a week?", "can I only lift 3x a week and grow?" */
const ADVICE_QUESTION = /^\s*(?:(?:so|ok|okay|hey|hmm|well)[\s,]+)*(?:should|can|could|would|is|are|will|do|does|what if|how about)\s+(?:i|it|you|that|3|three|training)\b|\b(?:is|are) (?:\d|one|two|three|four|five|six) (?:days?|sessions?|times?) (?:a|per) week (?:enough|ok|okay|good|too)\b|\bco du\b|\bdu khong\b/

const WEEKDAY_EN: Array<[RegExp, number]> = [
  [/\b(?:mon|monday)s?\b/, 1], [/\b(?:tue|tues|tuesday)s?\b/, 2], [/\b(?:wed|weds|wednesday)s?\b/, 3], [/\b(?:thu|thur|thurs|thursday)s?\b(?!\s*(?:[2-7]|hai|ba|tu|nam|sau|bay)\b)/, 4],
  [/\b(?:fri|friday)s?\b/, 5], [/\b(?:saturday)s?\b/, 6], [/\b(?:sunday)s?\b/, 0],
]
const VI_DAY: Record<string, number> = { "2": 1, hai: 1, "3": 2, ba: 2, "4": 3, tu: 3, "5": 4, nam: 4, "6": 5, sau: 5, "7": 6, bay: 6 }

/** Weekdays the user named (0 = Sunday … 6 = Saturday), in week order; null when none were named. */
export function namedWeekdays(folded: string): number[] | null {
  const days = new Set<number>()
  for (const [re, day] of WEEKDAY_EN) if (re.test(folded)) days.add(day)
  // "thứ 2, 4, 6", "thứ hai và thứ năm", "t2 t4 t6"
  for (const match of folded.matchAll(/\bthu\s+((?:[2-7]|hai|ba|tu|nam|sau|bay)(?:\s*(?:,|va|-|\/|and)\s*(?:thu\s+)?(?:[2-7]|hai|ba|tu|nam|sau|bay)\b)*)/g)) {
    for (const token of match[1]!.split(/\s*(?:,|va|-|\/|and|thu)\s*/)) if (token in VI_DAY) days.add(VI_DAY[token]!)
  }
  for (const match of folded.matchAll(/\bt([2-7])\b/g)) days.add(VI_DAY[match[1]!]!)
  if (/\b(?:chu nhat|cn)\b/.test(folded)) days.add(0)
  if (days.size === 0) return null
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
}

const TEMPORARY = /\b(?:this week|next week|this month|for (?:a while|now|the next (?:few|couple of|\d+) (?:weeks?|days?))|temporar\w*|until\b|for (?:\d|two|three|a few|a couple of) weeks|during (?:exams?|finals|the holidays?)|tuan nay|tuan toi|tuan sau|tam thoi|trong (?:vai|\d+) tuan|thang nay|den khi)\b/
const CORRECTION = /\b(?:actually|i meant|i mean|sorry,? (?:i mean|it'?s)|correction|scratch that|not (?:\d|three|four|five|two)\b|thuc ra|y minh la|nham|khong phai)\b/

const CAL = /\b(?:calories?|calorie target|kcal|kcals|cals?|calo|intake|energy target)\b/
const ABSOLUTE: RegExp[] = [
  /\b(?:set|change|make|put|move|lower|raise|drop|bump|increase|reduce|decrease|adjust|update|bring|cut)\b[^.?!]{0,40}?\b(?:to|at)\s+(\d{3,4})\s*(?:kcal|cals?|calories|calo)?\b/,
  /\b(?:dat|chinh|doi|giam|tang|sua|dieu chinh|ha)\b[^.?!]{0,30}?\b(?:xuong|len|thanh|ve|con|o muc)\s+(\d{3,4})\s*(?:kcal|calo|cal)?\b/,
]
const DELTA_DOWN: RegExp[] = [
  /\b(?:lower|reduce|drop|cut|decrease|bring down|trim|take)\b[^.?!]{0,32}?\bby\s+(\d{2,4})\b/,
  /\b(\d{2,4})\s*(?:kcal|cals?|calories|calo)\s*(?:less|fewer|lower|down|off)\b/,
  /\bminus\s+(\d{2,4})\b/,
  /\bgiam\b[^.?!]{0,16}?\b(\d{2,4})\s*(?:kcal|calo|cal)\b/,
]
const DELTA_UP: RegExp[] = [
  /\b(?:raise|increase|bump|add|up)\b[^.?!]{0,32}?\bby\s+(\d{2,4})\b/,
  /\b(\d{2,4})\s*(?:kcal|cals?|calories|calo)\s*(?:more|higher|extra|up)\b/,
  /\b(?:add|plus)\s+(\d{2,4})\s*(?:kcal|cals?|calories|calo)\b/,
  /\b(?:tang|them)\b[^.?!]{0,16}?\b(\d{2,4})\s*(?:kcal|calo|cal)\b/,
]
const REVIEW: RegExp[] = [
  /\b(?:should|do|must|would|will)\s+i\b[^.?!]{0,40}?\b(?:eat (?:less|more|fewer)|(?:lower|reduce|cut|change|adjust|increase|drop|decrease|raise)\b[^.?!]{0,20}?\b(?:calories?|kcal|calo|intake|target))/,
  /\b(?:do i (?:need|have) to|need to|is it better to)\b[^.?!]{0,20}?\b(?:eat (?:less|more)|(?:lower|reduce|cut|change|adjust|increase)\b[^.?!]{0,20}?\b(?:calories?|kcal|intake|target))/,
  /\b(?:review|recalculate|re-?check|update|adjust|look at|check)\b[^.?!]{0,10}?\b(?:my )?(?:daily )?(?:calorie|calories|kcal|nutrition|calo)\w*\s*(?:target|goal|plan)\b/,
  /\b(?:co nen|can|phai|co can)\b[^.?!]{0,16}?\b(?:an it (?:hon|lai|di)|an them|giam calo|tang calo|giam kcal|dieu chinh calo|doi calo)\b/,
  /\b(?:xem lai|dieu chinh|tinh lai|kiem tra lai)\b[^.?!]{0,12}?\b(?:muc tieu )?(?:calo|kcal|dinh duong)\b/,
]
const TRAINING_LESS = /\b(?:train(?:ing)? less|fewer (?:days|sessions|workouts)|skip(?:ped|ping)? (?:my |the |today'?s )?(?:workout|session|gym|training)|cancel\w* (?:my |the |today'?s )?(?:workout|session|training)|not training|won'?t (?:train|be training)|no workout|days? (?:a|per) week|tap it hon|nghi tap|bo buoi tap|huy buoi tap|buoi\/tuan)\b/
const REST_DAY = /\b(?:rest day|resting today|day off|nghi hom nay|ngay nghi)\b/

const firstNumber = (folded: string, patterns: RegExp[]): number | null => {
  for (const re of patterns) {
    const match = folded.match(re)
    if (match) return Number(match[1])
  }
  return null
}

export function detectAdaptiveChange(message: string): AdaptiveChange | null {
  const folded = fold(message)
  const correction = CORRECTION.test(folded)

  // ---- training availability
  if (!ADVICE_QUESTION.test(folded)) {
    for (const re of AVAILABILITY) {
      const match = folded.match(re)
      if (!match) continue
      const raw = match[1]!
      const daysPerWeek = /^\d$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw] ?? NaN
      if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) return null
      const weekdays = namedWeekdays(folded)
      return {
        kind: "AVAILABILITY",
        daysPerWeek,
        weekdays: weekdays && weekdays.length === daysPerWeek ? weekdays : null,
        temporal: TEMPORARY.test(folded) ? "TEMPORARY" : "LASTING",
        correction,
      }
    }
  }

  // ---- calorie target (an explicit amount wins over a review ask)
  if (CAL.test(folded) || /\b(?:eat (?:less|more)|an it|an them)\b/.test(folded)) {
    const reason = REST_DAY.test(folded) ? "REST_DAY" : TRAINING_LESS.test(folded) ? "TRAINING_LESS" : null
    const absolute = CAL.test(folded) ? firstNumber(folded, ABSOLUTE) : null
    if (absolute !== null && absolute >= 1000 && absolute <= 6000) return { kind: "CALORIE_TARGET", request: { mode: "ABSOLUTE", targetKcal: absolute }, reason, correction }
    const down = CAL.test(folded) ? firstNumber(folded, DELTA_DOWN) : null
    if (down !== null && down >= 10 && down <= 1500) return { kind: "CALORIE_TARGET", request: { mode: "DELTA", deltaKcal: -down }, reason, correction }
    const up = CAL.test(folded) ? firstNumber(folded, DELTA_UP) : null
    if (up !== null && up >= 10 && up <= 1500) return { kind: "CALORIE_TARGET", request: { mode: "DELTA", deltaKcal: up }, reason, correction }
    if (REVIEW.some((re) => re.test(folded))) return { kind: "CALORIE_TARGET", request: { mode: "REVIEW" }, reason, correction }
  }
  return null
}
