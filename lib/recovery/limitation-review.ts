import { BODY_REGION_LABEL, regionForSite, regionLoad, type BodyRegion, type RegionLoad } from "@/lib/training/body-region-load"
import { excludedBy, findAlternatives, findCatalogueExercise, type EquipmentConstraint, type ExperienceLevel } from "@/lib/training/exercise-substitution"
import { EXERCISE_CATALOGUE, type ExerciseLibraryItem } from "@/lib/workouts/exercise-library"
import { EXERCISE_PROFILES } from "@/lib/workouts/exercise-profiles"

/**
 * MF-F2 — a limitation the user REPORTED ("my foot hurts") reviewed against today's ACTUAL workout. Pure and deterministic:
 * no model, no diagnosis. It decides which planned exercises load the reported area (curated exercise metadata only,
 * lib/training/body-region-load.ts), which catalogue alternatives keep load off it (the substitution engine, filtered),
 * what the reviewable options are, and whether a safety question is still open. A readiness number never clears a local
 * limitation: it is reported, and explained, but it does not change any exercise's verdict.
 */

export type ReportedLimitation = { site: string; region: BodyRegion | null; quote: string }

export type ReviewedExercise = {
  sessionExerciseId: string | null
  name: string
  slug: string | null
  isSkipped: boolean
  /** AFFECTED = loads a reported region; REVIEW = touches/braces it; CLEAR = setup doesn't load it; UNKNOWN = no profile. */
  status: "AFFECTED" | "REVIEW" | "CLEAR" | "UNKNOWN"
  basis: string | null
}

export type AlternativeOption = { slug: string; name: string; load: Exclude<RegionLoad, "loads">; basis: string; basisVi: string }

export type ExerciseAlternatives = {
  forSessionExerciseId: string | null
  forName: string
  options: AlternativeOption[]
  /** Why there are none, when there are none. */
  none: "NO_PROFILE" | "ALL_LOAD_AREA" | "ONLY_ALREADY_PLANNED" | "EQUIPMENT" | null
  alreadyPlanned: string[]
}

export type LimitationOption = "SKIP_AFFECTED" | "REST" | "KEEP"

export type WorkoutRef =
  | { kind: "SESSION"; sessionId: string; name: string; started: boolean }
  | { kind: "PLANNED_DAY"; name: string }
  | { kind: "NONE" }
  | { kind: "DONE"; name: string }
  | { kind: "POSTPONED"; name: string }
  | { kind: "UNKNOWN" }

export type LimitationReview = {
  limitations: ReportedLimitation[]
  mappedRegions: BodyRegion[]
  workout: WorkoutRef
  exercises: ReviewedExercise[]
  alternatives: ExerciseAlternatives[]
  options: LimitationOption[]
  /** The option the proposal is built for when the user hasn't chosen one. null = nothing to change. */
  recommended: LimitationOption | null
  /** Weight-bearing / onset / swelling not yet answered in this chat. */
  needsClarification: boolean
  hold: "recovery" | "unverified" | null
  alreadyAdjusted: boolean
  /** With no adjustable session: catalogue examples whose setup keeps load off the reported area (never "safe"). */
  trainAnyway: string[]
}

export type ReviewInput = {
  limitations: Array<{ site: string; quote: string }>
  workout: WorkoutRef
  /** Today's exercises (session rows, or the planned day's template when no session exists yet). */
  exercises: Array<{ sessionExerciseId: string | null; name: string; slug: string | null; isSkipped: boolean }>
  experience: ExperienceLevel | null
  constraints: EquipmentConstraint[]
  familiarSlugs?: ReadonlySet<string>
  hold: "recovery" | "unverified" | null
  /** Today's session already carries an applied adjustment (one per session): no further write is offered. */
  alreadyAdjusted?: boolean
  /** Every user message in this chat (oldest first, current last): has the safety question been answered? */
  userMessages: string[]
  catalogue?: ExerciseLibraryItem[]
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()

/** The user has said how it behaves: can walk / bear weight, no swelling, gradual onset… (answers the safety question). */
const ANSWERED = /\b(?:can (?:still )?(?:walk|put (?:my )?(?:full )?weight)|walk(?:ing)? (?:is )?(?:fine|ok|okay|normally)|bear(?:ing)? weight (?:is )?(?:fine|ok)|no (?:swelling|bruising)|not swollen|didn'?t (?:twist|fall|roll)|no (?:injury|twist|fall)|just (?:sore|achy|aches?|tight)|mild|van di (?:duoc|binh thuong)|di lai (?:binh thuong|duoc)|khong (?:bi )?sung|khong bam tim)\b/

export function reviewLimitation(input: ReviewInput): LimitationReview {
  const limitations = input.limitations.map((item) => ({ ...item, region: regionForSite(item.site) }))
  const mappedRegions = [...new Set(limitations.map((item) => item.region).filter((region): region is BodyRegion => region !== null))]
  const catalogue = input.catalogue

  const itemOf = (row: { slug: string | null; name: string }) => findCatalogueExercise({ slug: row.slug, name: row.name }, catalogue)

  const exercises: ReviewedExercise[] = input.exercises.map((row) => {
    const item = itemOf(row)
    const verdicts = item ? mappedRegions.map((region) => ({ region, verdict: regionLoad(item, region) })) : []
    if (!item || verdicts.some((entry) => entry.verdict === null) || mappedRegions.length === 0) {
      return { ...row, slug: item?.slug ?? row.slug, status: "UNKNOWN", basis: null }
    }
    const loads = verdicts.find((entry) => entry.verdict!.load === "loads")
    const contact = verdicts.find((entry) => entry.verdict!.load === "contact")
    const pick = loads ?? contact ?? verdicts[0]
    return {
      ...row,
      slug: item.slug ?? row.slug,
      status: loads ? "AFFECTED" : contact ? "REVIEW" : "CLEAR",
      basis: pick?.verdict?.basis ?? null,
    }
  })

  const plannedSlugs = new Set(exercises.filter((row) => !row.isSkipped && row.slug).map((row) => row.slug as string))
  const alternatives: ExerciseAlternatives[] = exercises
    .filter((row) => row.status === "AFFECTED" && !row.isSkipped)
    .map((row) => {
      const current = itemOf(row)
      const base = { forSessionExerciseId: row.sessionExerciseId, forName: row.name, alreadyPlanned: [] as string[] }
      if (!current) return { ...base, options: [], none: "NO_PROFILE" as const }
      const result = findAlternatives({
        current,
        reasons: ["discomfort"],
        constraints: input.constraints,
        experience: input.experience,
        familiarSlugs: input.familiarSlugs,
        hold: input.hold !== null,
        catalogue,
      })
      const clear: Array<AlternativeOption & { rank: number }> = []
      const alreadyPlanned: string[] = []
      for (const alt of result.alternatives) {
        const verdicts = mappedRegions.map((region) => regionLoad(alt.item, region))
        if (verdicts.some((verdict) => verdict === null || verdict.load === "loads")) continue
        if (plannedSlugs.has(alt.item.slug ?? "")) {
          alreadyPlanned.push(alt.item.name)
          continue
        }
        const contact = verdicts.find((verdict) => verdict!.load === "contact")
        clear.push({ slug: alt.item.slug ?? "", name: alt.item.name, load: contact ? "contact" : "none", basis: (contact ?? verdicts[0])!.basis, basisVi: (contact ?? verdicts[0])!.basisVi, rank: contact ? 1 : 0 })
      }
      const options: AlternativeOption[] = clear.sort((a, b) => a.rank - b.rank).slice(0, 3).map((option) => ({ slug: option.slug, name: option.name, load: option.load, basis: option.basis, basisVi: option.basisVi }))
      const none = options.length > 0
        ? null
        : alreadyPlanned.length > 0
          ? "ONLY_ALREADY_PLANNED" as const
          : result.alternatives.length === 0 && result.notRecommended.length > 0
            ? "EQUIPMENT" as const
            : "ALL_LOAD_AREA" as const
      return { ...base, options, none, alreadyPlanned }
    })

  const live = exercises.filter((row) => !row.isSkipped)
  const affected = live.filter((row) => row.status === "AFFECTED" || row.status === "UNKNOWN")
  const adjustable = input.workout.kind === "SESSION" && !input.workout.started && !input.alreadyAdjusted
  const options: LimitationOption[] = []
  if (adjustable && affected.length > 0 && affected.length < live.length) options.push("SKIP_AFFECTED")
  if (adjustable && live.length > 0) options.push("REST")
  if (input.workout.kind === "SESSION" || input.workout.kind === "PLANNED_DAY") options.push("KEEP")

  const recommended: LimitationOption | null = !adjustable || affected.length === 0
    ? null
    : options.includes("SKIP_AFFECTED") && input.hold === null
      ? "SKIP_AFFECTED"
      : "REST"

  // No session to adjust, but "what can I train?" still deserves an answer: catalogue exercises whose setup keeps load off
  // every reported region and that fit the user's equipment — one per primary muscle, most supported setups first.
  const trainAnyway: string[] = []
  if (mappedRegions.length > 0 && input.hold === null && (input.workout.kind === "NONE" || input.workout.kind === "UNKNOWN")) {
    const seen = new Set<string>()
    const rank = { guided: 0, supported: 1, free: 2 } as const
    for (const item of [...(catalogue ?? EXERCISE_CATALOGUE)].sort((a, b) => (rank[EXERCISE_PROFILES[a.slug ?? ""]?.stability ?? "free"] - rank[EXERCISE_PROFILES[b.slug ?? ""]?.stability ?? "free"]) || a.name.localeCompare(b.name))) {
      const profile = EXERCISE_PROFILES[item.slug ?? ""]
      if (!profile || seen.has(item.primaryMuscle) || excludedBy(profile, input.constraints)) continue
      if (!mappedRegions.every((region) => regionLoad(item, region)?.load === "none")) continue
      seen.add(item.primaryMuscle)
      trainAnyway.push(item.name)
      if (trainAnyway.length === 4) break
    }
  }

  const answered = input.userMessages.some((message) => ANSWERED.test(fold(message)))
  return {
    limitations,
    mappedRegions,
    workout: input.workout,
    exercises,
    alternatives,
    options,
    recommended,
    needsClarification: !answered,
    hold: input.hold,
    alreadyAdjusted: Boolean(input.alreadyAdjusted),
    trainAnyway,
  }
}

/* ---------------------------------------------------------------- which turns this flow answers */

// A question or request about TODAY'S training (not a general "best exercise for foot pain" — that names no plan).
const TRAINING_REF = /\b(?:workouts?|sessions?|train(?:ing)?|lift(?:ing)?|gym|exercises?|leg day|legs|lower body|upper body|squats?|deadlifts?|today|tonight|my plan|routine|buoi tap|tap luyen|bai tap|lich tap|hom nay|tap)\b/
const ASKS = /\?|\b(?:what (?:should|can|do) i|should i|can i|could i|how (?:should|do) i|is it (?:ok|okay|safe)|do i (?:still )?(?:train|go|lift)|what now|help me|nen|co nen|the nao|lam gi|tap gi|duoc khong|sao)\b/

/** True for a turn the limitation flow should answer, given an active reported limitation: a training-today ask, or a choice. */
export function isLimitationTurn(message: string): boolean {
  const folded = fold(message)
  if (CHOICE_REST.test(folded) || CHOICE_SKIP.test(folded) || CHOICE_KEEP.test(folded) || CHOICE_NUMBER.test(folded)) return true
  if (CHOICE_REPLACE.test(folded) && /\b(?:for|with|to|bang|sang)\b/.test(folded) && (TRAINING_REF.test(folded) || /\b(?:curls?|press(?:es)?|raises?|rows?|extensions?|lunges?|calf|rdl|thrusts?|bridges?|pulldowns?)\b/.test(folded))) return true
  return TRAINING_REF.test(folded) && ASKS.test(folded)
}

/* ---------------------------------------------------------------- user choice in a follow-up */

export type LimitationChoice =
  | { kind: "SKIP_AFFECTED" | "REST" | "KEEP" }
  | { kind: "REPLACE"; fromSessionExerciseId: string; fromName: string; toSlug: string; toName: string }
  | { kind: "REPLACE_UNMATCHED" }

const CHOICE_REST = /\b(?:rest (?:today|day)|take (?:the day|today|a rest day|a day) off|day off|skip (?:today|the (?:whole )?(?:session|workout)|(?:today'?s|my) (?:session|workout))|postpone (?:the |today'?s |my )?(?:session|workout)|nghi (?:hom nay|tap|ngay hom nay)|hoan buoi tap)\b/
const CHOICE_SKIP = /\b(?:leave (?:them|those|these) out|skip (?:those|them|these|the (?:[a-z]+[- ])?loading (?:ones|exercises))|do the rest|leave out the|bo (?:cac |nhung )?bai (?:do|nay)|tap phan con lai)\b/
const CHOICE_KEEP = /\b(?:keep (?:my|the) (?:plan|workout|session)|keep (?:it|everything) (?:as (?:it is|is)|the same)|no changes?|don'?t change (?:anything|it|my plan)|leave (?:it|my plan|the plan) as (?:it is|is)|giu nguyen|khong (?:can )?thay doi)\b/
/** "option 2" / "lựa chọn 2" — resolved against the numbered list the reply showed (review.options). */
const CHOICE_NUMBER = /\b(?:option|lua chon|cach)\s*(\d)\b|\b(first|second|third) option\b/
const CHOICE_REPLACE = /\b(?:swap|replace|switch|sub(?:stitute)?|change|doi|thay)\b/

function nameHit(folded: string, name: string): boolean {
  const n = fold(name)
  if (folded.includes(n)) return true
  // "swap the RDL", "replace squats": every distinctive word of the name (or its initials) appears.
  const words = n.split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !["the", "with", "and", "machine", "barbell", "dumbbell", "cable"].includes(word))
  const initials = n.split(/[^a-z0-9]+/).filter(Boolean).map((word) => word[0]).join("")
  return (words.length > 0 && words.every((word) => new RegExp(`\\b${word}s?\\b`).test(folded))) || (initials.length >= 3 && new RegExp(`\\b${initials}s?\\b`).test(folded))
}

export function detectLimitationChoice(message: string, review: LimitationReview): LimitationChoice | null {
  const folded = fold(message)
  if (CHOICE_REPLACE.test(folded)) {
    const from = review.alternatives.find((entry) => nameHit(folded, entry.forName))
    const to = from?.options.find((option) => nameHit(folded, option.name))
    if (from && to && from.forSessionExerciseId) return { kind: "REPLACE", fromSessionExerciseId: from.forSessionExerciseId, fromName: from.forName, toSlug: to.slug, toName: to.name }
    if (/\b(?:for|with|to|bang|sang)\b/.test(folded)) return { kind: "REPLACE_UNMATCHED" }
  }
  const numbered = folded.match(CHOICE_NUMBER)
  if (numbered) {
    const index = numbered[1] ? Number(numbered[1]) - 1 : ["first", "second", "third"].indexOf(numbered[2]!)
    const option = review.options[index]
    if (option) return { kind: option }
  }
  if (CHOICE_KEEP.test(folded)) return { kind: "KEEP" }
  if (CHOICE_REST.test(folded)) return { kind: "REST" }
  if (CHOICE_SKIP.test(folded)) return { kind: "SKIP_AFFECTED" }
  return null
}

/* ---------------------------------------------------------------- reply */

const SITE_LABEL: Record<string, { en: string; vi: string }> = {
  foot: { en: "foot", vi: "bàn chân" },
  ankle: { en: "ankle", vi: "cổ chân" },
  knee: { en: "knee", vi: "gối" },
  hip: { en: "hip", vi: "hông" },
  "lower back": { en: "lower back", vi: "lưng dưới" },
  back: { en: "back", vi: "lưng" },
  shoulder: { en: "shoulder", vi: "vai" },
  elbow: { en: "elbow", vi: "khuỷu tay" },
  wrist: { en: "wrist", vi: "cổ tay" },
  neck: { en: "neck", vi: "cổ" },
  groin: { en: "groin", vi: "háng" },
  hamstring: { en: "hamstring", vi: "gân kheo" },
}

export type ReadinessLine = { verified: number | null; stated: number | null; status: "CURRENT" | "STALE" | "MISSING" | "UNAVAILABLE"; painFlag: boolean }

const list = (items: string[], vi: boolean) => (items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} ${vi ? "và" : "and"} ${items[items.length - 1]}`)

/**
 * Block order is deliberate: (1) the decision on today's workout, (2) the safety question — those two survive the
 * coherence layer's "shorten"/"brief" clamps (realize.ts keeps the first two paragraphs) — then readiness, the per-
 * exercise breakdown, alternatives, options and nutrition.
 */
export function renderLimitationReply(input: {
  review: LimitationReview
  readiness: ReadinessLine
  language: "en" | "vi"
  /** What this turn proposes (a pending Confirm card) — null when nothing is proposed. */
  proposed: { kind: LimitationOption | "REPLACE"; summary: string } | null
  choice: LimitationChoice | null
  /** Set when a proposal could not be prepared (store/read failure): the reply must not imply one exists. */
  proposalUnavailable?: boolean
  energyLine: string | null
}): string {
  const { review, readiness, language } = input
  const vi = language === "vi"
  // The user's own word for the area ("foot", "ankle"), not the internal region name.
  const area = list([...new Set(review.limitations.map((item) => SITE_LABEL[item.site]?.[language] ?? (item.region ? BODY_REGION_LABEL[item.region][language] : item.site)))], vi)
  const w = review.workout
  const live = review.exercises.filter((row) => !row.isSkipped)
  const by = (status: ReviewedExercise["status"]) => live.filter((row) => row.status === status).map((row) => row.name)
  const postponed = review.exercises.filter((row) => row.isSkipped).map((row) => row.name)
  const affected = [...by("AFFECTED"), ...by("UNKNOWN")]
  const firstTurn = input.choice === null || input.choice.kind === "REPLACE_UNMATCHED"
  const mapped = review.mappedRegions.length > 0
  const today = (label: string) => label.replace(/^Today's/, "today's")
  const parts: string[] = []

  // 1. The decision on today's workout.
  const decision: string[] = []
  if (w.kind === "NONE") {
    decision.push(vi
      ? `Hôm nay không có buổi tập nào được lên lịch, nên không có gì cần đổi. Khi tập lại, những bài cần xem lại là các bài dồn lực lên ${area}.`
      : `There's no workout scheduled today, so there's nothing to change. When you next train, the moves to review are the ones that load your ${area}.`)
  } else if (w.kind === "UNKNOWN") {
    decision.push(vi
      ? "Mình không đọc được buổi tập hôm nay lúc này, nên không xem được bài nào bị ảnh hưởng. Chưa có gì bị thay đổi."
      : "I couldn't read today's workout just now, so I can't check which exercises are affected. Nothing has been changed.")
  } else if (w.kind === "DONE") {
    decision.push(vi ? `Buổi ${w.name} hôm nay đã hoàn thành, nên không còn gì để điều chỉnh.` : `Today's ${w.name} is already finished, so there's nothing left to adjust.`)
  } else if (w.kind === "POSTPONED") {
    decision.push(vi ? `Buổi ${w.name} hôm nay đã được hoãn, nên không còn gì để điều chỉnh.` : `Today's ${w.name} is already postponed, so there's nothing left to adjust.`)
  } else {
    const started = w.kind === "SESSION" && w.started
    const label = vi
      ? `Buổi ${w.name} hôm nay${w.kind === "PLANNED_DAY" ? " (chưa bắt đầu)" : started ? " (đang tập)" : ""}`
      : `Today's ${w.name}${w.kind === "PLANNED_DAY" ? " (not started yet)" : started ? " (in progress)" : ""}`
    if (review.alreadyAdjusted) {
      decision.push(vi
        ? `${label} đã được điều chỉnh${postponed.length ? `: ${list(postponed, vi)} đã được hoãn` : ""}. Mình không chồng thêm thay đổi nào lên buổi này.${affected.length ? ` Vẫn còn bài dồn lực lên ${area}: ${list(affected, vi)} — hãy bỏ qua ngay trong màn hình tập nếu đau.` : ""}`
        : `${label} has already been adjusted${postponed.length ? `: ${list(postponed, vi)} ${postponed.length === 1 ? "is" : "are"} postponed` : ""}. I won't stack another change on it.${affected.length ? ` Still in it and loading your ${area}: ${list(affected, vi)} — skip ${affected.length === 1 ? "it" : "them"} in the workout screen if ${affected.length === 1 ? "it hurts" : "they hurt"}.` : ""}`)
    } else if (!mapped) {
      decision.push(vi
        ? `Mình chưa đối chiếu được vùng "${area}" với từng bài trong ${label.toLowerCase()} một cách đáng tin cậy, nên cách an toàn hơn là bỏ những bài làm cơn đau xuất hiện, hoặc nghỉ hôm nay.`
        : `I can't reliably map "${area}" onto the individual exercises in ${today(label)}, so the safer default is to leave out anything that brings the pain on, or to rest today.`)
    } else if (affected.length === 0) {
      decision.push(vi
        ? `Theo cách thực hiện, không bài nào trong ${label.toLowerCase()} dồn lực chính lên ${area}.`
        : `By how each exercise is set up, nothing in ${today(label)} puts its main load through your ${area}.`)
    } else {
      decision.push(vi
        ? `${label}: ${affected.length}/${live.length} bài dồn lực lên ${area} — ${list(affected, vi)}.`
        : `${label}: ${affected.length} of ${live.length} exercises load your ${area} — ${list(affected, vi)}.`)
    }
    if (started && !review.alreadyAdjusted) {
      decision.push(vi
        ? "Buổi tập đã bắt đầu nên mình không đổi được kế hoạch từ đây — hãy bỏ qua bài gây đau ngay trong màn hình tập."
        : "The session has already started, so I can't change it from here — skip any painful exercise in the workout screen.")
    }
    if (w.kind === "PLANNED_DAY") {
      decision.push(vi
        ? "Buổi này chưa bắt đầu nên không có gì cần lưu: muốn nghỉ thì chỉ cần không bắt đầu hôm nay; nếu tập, hãy bỏ qua các bài trên ngay trong màn hình tập."
        : "It hasn't been started, so there's nothing to change in the app: to rest, just don't start it today; if you train, skip the exercises above in the workout screen.")
    }
  }
  if (input.choice?.kind === "KEEP") {
    decision.push(vi
      ? `Được — kế hoạch giữ nguyên, mình không thay đổi gì. Nếu bài nào làm ${area} đau, hãy dừng bài đó.`
      : `Okay — your plan stays as it is; nothing was changed. If an exercise brings on ${area} pain, stop that one.`)
  } else if (input.choice?.kind === "REPLACE" && !input.proposed && !input.proposalUnavailable) {
    decision.push(review.hold
      ? vi ? "Đổi bài là thêm một bài tập khác, nên mình không đặt được khi việc tập đang tạm dừng. Chưa có gì thay đổi." : "A swap adds a different exercise, so I can't set one up while training is on hold. Nothing has changed."
      : vi ? "Buổi tập này không còn đổi bài được từ đây. Chưa có gì thay đổi." : "That swap can't be set up for this session from here. Nothing has changed.")
  } else if (input.choice?.kind === "REPLACE_UNMATCHED") {
    decision.push(vi
      ? "Mình chưa khớp được bài muốn đổi với một lựa chọn bên dưới. Hãy nói rõ cả hai bài, ví dụ: \"đổi Romanian Deadlift sang Lying Leg Curl\"."
      : "I couldn't match that swap to one of the options below. Name both, e.g. \"swap Romanian Deadlift for Lying Leg Curl\".")
  }
  if (review.trainAnyway.length > 0) {
    decision.push(vi
      ? `Nếu vẫn muốn tập, các bài có cách thực hiện không dồn lực lên ${area} — ví dụ ${list(review.trainAnyway, vi)} — chỉ là lựa chọn khi hoàn toàn không đau.`
      : `If you want to train anyway, work whose setup keeps load off your ${area} — for example ${list(review.trainAnyway, vi)} — is an option only if it stays completely pain-free.`)
  }
  if (input.proposed) {
    // The Confirm card carries the full summary; the reply names the change without repeating the list it just gave.
    const short = input.proposed.kind === "SKIP_AFFECTED"
      ? vi ? `hoãn ${affected.length === 1 ? "bài đó" : `${affected.length} bài đó`} hôm nay, phần còn lại giữ nguyên` : `postpone ${affected.length === 1 ? "that one" : `those ${affected.length}`} today and keep the rest`
      : input.proposed.summary
    decision.push(vi
      ? `Đề xuất: ${short}. Bấm Xác nhận bên dưới để áp dụng — hiện chưa có gì thay đổi.`
      : `Proposed: ${short}. Tap Confirm below to apply it — nothing has changed yet.`)
  } else if (input.proposalUnavailable) {
    decision.push(vi
      ? "Mình chưa chuẩn bị được đề xuất để bạn xác nhận lúc này, nên chưa có gì thay đổi. Bạn có thể hỏi lại sau ít phút."
      : "I couldn't prepare a change for you to confirm just now, so nothing has changed. Ask again in a moment.")
  }
  parts.push(decision.join(" "))

  // 2. The safety question + when to get assessed (ends with the question, so brief mode keeps it).
  if (firstTurn || review.needsClarification) {
    parts.push(review.needsClarification
      ? vi
        ? `Nếu bạn không chịu được trọng lượng, bị sưng hoặc bầm sau chấn thương, đau dữ dội hoặc ngày càng tệ, hay bị tê — hãy đi khám bác sĩ hoặc physiotherapist sớm trước khi tập lại vùng đó. Hai câu hỏi nhanh: bạn có đi lại và dồn trọng lượng lên ${area} bình thường được không, và cơn đau có bắt đầu sau một cú trẹo, ngã hay tiếng "pop", hoặc có sưng/bầm không?`
        : "If you can't bear weight, it's swollen or bruised after an injury, the pain is severe or getting worse, or you have numbness — get it checked promptly by a doctor or physio before training it. Two quick checks: can you walk and put your full weight on it normally, and did it start with a twist, a fall or a pop, or is it swollen or bruised?"
      : vi
        ? "Nếu cơn đau tăng, bắt đầu sưng, hoặc bạn không còn chịu được trọng lượng bình thường, hãy dừng và đi khám bác sĩ hoặc physiotherapist."
        : "If it gets worse, starts to swell, or you can't bear weight normally, stop and get it checked by a doctor or physio.")
  }

  // 3. Readiness vs the local limitation — the number is reported, never used to clear anything.
  if (firstTurn) {
    if (readiness.painFlag) {
      parts.push(vi
        ? "Check-in hôm nay của bạn có đánh dấu đau/ốm, nên việc tập đang tạm dừng — hồi phục được ưu tiên."
        : "Your check-in today flagged pain or illness, so training is on hold — recovery comes first.")
    } else if (readiness.verified !== null) {
      const conflict = readiness.stated !== null && readiness.stated !== readiness.verified
      parts.push(vi
        ? `Điểm hồi phục hôm nay của bạn là ${readiness.verified} (check-in sáng nay${conflict ? `; bạn nói ${readiness.stated}, nhưng check-in sáng nay ghi ${readiness.verified}` : ""}). Điểm này phản ánh giấc ngủ, căng thẳng, mệt mỏi, đau mỏi cơ và tâm trạng — nó không đo một vấn đề tại chỗ như đau ${area}, nên điểm cao không có nghĩa là các bài dồn lực lên ${area} đều ổn. Mình không thể biết nguyên nhân cơn đau qua chat.`
        : `Your readiness today is ${readiness.verified} (from this morning's check-in${conflict ? `; you said ${readiness.stated}, but this morning's check-in says ${readiness.verified}` : ""}). That score reflects sleep, stress, fatigue, soreness and mood — it doesn't measure a local problem like ${area} pain, so a high score doesn't clear exercises that load your ${area}. I can't tell what's causing the pain from here.`)
    } else {
      parts.push(vi
        ? `${readiness.stated !== null ? `Bạn nói điểm hồi phục là ${readiness.stated}, nhưng hôm nay chưa có check-in nên đó chưa phải điểm được ghi nhận. ` : "Hôm nay chưa có check-in hồi phục, nên mình không có điểm để dựa vào. "}Dù sao, điểm hồi phục cũng không đo được đau ${area}. Mình không thể biết nguyên nhân cơn đau qua chat.`
        : `${readiness.stated !== null ? `You mentioned ${readiness.stated}, but there's no check-in today, so that isn't a recorded score. ` : "There's no recovery check-in today, so I don't have a readiness score to go on. "}Either way, readiness doesn't measure ${area} pain. I can't tell what's causing it from here.`)
    }
  }

  // 4. Per-exercise breakdown and 5. alternatives — only ones whose setup keeps load off the area; never "safe".
  if (firstTurn && mapped && (w.kind === "SESSION" || w.kind === "PLANNED_DAY") && !review.alreadyAdjusted) {
    const lines = [vi ? "Theo cách thực hiện từng bài:" : "By how each exercise is set up:"]
    if (by("AFFECTED").length) lines.push(vi ? `- Dồn lực lên ${area}: ${list(by("AFFECTED"), vi)}.` : `- Loads your ${area}: ${list(by("AFFECTED"), vi)}.`)
    if (by("REVIEW").length) lines.push(vi ? `- Có tì/chạm vào ${area} nhưng không chịu tải chính: ${list(by("REVIEW"), vi)} — chỉ giữ nếu hoàn toàn không đau.` : `- Touches or braces your ${area} without carrying the load: ${list(by("REVIEW"), vi)} — keep only if completely pain-free.`)
    if (by("CLEAR").length) lines.push(vi ? `- Không dồn lực lên ${area}: ${list(by("CLEAR"), vi)}.` : `- Doesn't load your ${area}: ${list(by("CLEAR"), vi)}.`)
    if (by("UNKNOWN").length) lines.push(vi ? `- Chưa có dữ liệu chuyển động để đánh giá: ${list(by("UNKNOWN"), vi)} — mình xem như có thể ảnh hưởng.` : `- No movement profile to judge from: ${list(by("UNKNOWN"), vi)} — treated as possibly affected.`)
    parts.push(lines.join("\n"))

    if (review.alternatives.length > 0) {
      const alt = [vi
        ? `Lựa chọn thay thế giúp không dồn lực lên ${area} (dựa trên cách thực hiện — không đảm bảo sẽ không đau):`
        : `Swaps that keep load off your ${area} (based on how they're set up — not a guarantee they won't hurt):`]
      for (const entry of review.alternatives) {
        if (entry.options.length > 0) {
          alt.push(`- ${entry.forName} → ${entry.options.map((option) => `${option.name} (${vi ? option.basisVi : option.basis}${option.load === "contact" ? vi ? " — dừng nếu chạm vào chỗ đau" : " — stop if it presses on the sore spot" : ""})`).join(vi ? "; hoặc " : "; or ")}`)
        } else if (entry.none === "ONLY_ALREADY_PLANNED") {
          alt.push(vi
            ? `- ${entry.forName}: lựa chọn duy nhất không dồn lực lên ${area} là ${list(entry.alreadyPlanned, vi)}, đã có sẵn trong buổi hôm nay.`
            : `- ${entry.forName}: the only option that keeps load off your ${area} is ${list(entry.alreadyPlanned, vi)}, already in today's session.`)
        } else if (entry.none === "EQUIPMENT") {
          alt.push(vi ? `- ${entry.forName}: không có lựa chọn phù hợp với dụng cụ bạn có mà không dồn lực lên ${area}.` : `- ${entry.forName}: nothing that fits your equipment keeps load off your ${area}.`)
        } else if (entry.none === "NO_PROFILE") {
          alt.push(vi ? `- ${entry.forName}: chưa có dữ liệu để gợi ý bài thay thế.` : `- ${entry.forName}: no movement profile, so I can't match a swap.`)
        } else {
          alt.push(vi ? `- ${entry.forName}: mọi bài thay thế cùng nhóm cơ đều dồn lực lên ${area} — nên bỏ hôm nay.` : `- ${entry.forName}: every alternative for that muscle loads your ${area} too — I'd leave it out today.`)
        }
      }
      if (review.hold) alt.push(vi ? "Vì việc tập đang tạm dừng, các bài thay thế chỉ để tham khảo — đổi bài không gỡ việc tạm dừng." : "Because training is on hold, these are for reference only — a swap doesn't lift the hold.")
      parts.push(alt.join("\n"))
    }
  }

  // 6. The numbered options (the same list "option N" resolves against).
  const optionText = (option: LimitationOption) => {
    if (option === "SKIP_AFFECTED") return vi ? `Bỏ ${affected.length} bài dồn lực lên ${area} hôm nay, tập phần còn lại` : `Leave out the ${affected.length === 1 ? "exercise that loads" : `${affected.length} exercises that load`} your ${area} today and do the rest`
    if (option === "REST") return vi ? "Nghỉ hôm nay — hoãn cả buổi (kế hoạch không bị sửa)" : "Rest today — postpone the whole session (your plan itself isn't changed)"
    return vi ? "Giữ nguyên kế hoạch" : "Keep the plan as it is"
  }
  if (input.choice?.kind !== "KEEP" && review.options.length > 1) {
    const tag = vi ? " (đề xuất ở trên)" : " (proposed above)"
    // A concrete swap from this review as the example (markdown would eat "<exercise>" placeholders).
    const example = review.hold ? null : review.alternatives.find((entry) => entry.options.length > 0)
    const swap = example ? (vi ? `, hoặc "đổi ${example.forName} sang ${example.options[0]!.name}"` : `, or "swap ${example.forName} for ${example.options[0]!.name}"`) : ""
    parts.push([
      vi ? "Các lựa chọn của bạn:" : "Your options:",
      ...review.options.map((option, index) => `${index + 1}. ${optionText(option)}${option === input.proposed?.kind ? tag : ""}`),
    ].join("\n"))
    // Its own paragraph: right after a numbered list, markdown folds a plain line into the last item.
    parts.push(vi
      ? `Muốn đổi, hãy nói "nghỉ hôm nay", "bỏ các bài đó" hoặc "giữ nguyên kế hoạch"${swap}.`
      : `To switch, say "rest today", "leave those out" or "keep my plan"${swap}.`)
  }

  // 7. Nutrition.
  if (input.energyLine) parts.push(input.energyLine)
  return parts.join("\n\n")
}

