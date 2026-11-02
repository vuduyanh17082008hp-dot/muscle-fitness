import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { AdaptiveChange } from "@/lib/dante-core/adaptive-change"
import { buildCalorieProposal, buildScheduleProposal, describeCalorieProposal, describeScheduleProposal, readCalibration, type CalorieBuild } from "@/lib/dante-core/adaptive-proposals"
import type { ChatStreamPendingConfirmation } from "@/lib/dante-core/chat-stream-protocol"
import { createPendingAction } from "@/lib/dante-core/tools/pending-actions"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext, type NutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { ACTIVITY_LEVEL_LABELS } from "@/lib/nutrition/plan"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { describeWeek, perWeek, weekdayName } from "@/lib/training/schedule-change"
import { localDateTimeParts } from "@/lib/training/load-today-session"

/**
 * MF-S1 H1+H2: a reported change ("I can only train 3 days a week now", "lower my calories by 200", "should I eat less
 * since I'm training less?") → canonical state read → at most ONE concrete, reviewable proposal → Accept / Modify /
 * Reject on its card. Nothing is written here except the pending proposal row; the change itself only happens when the
 * user accepts and the tool re-validates (lib/dante-core/tools/write/update-*.ts).
 */

type Lang = "en" | "vi"

export type AdaptiveTurnResult = {
  draft: string
  pendingConfirmation: ChatStreamPendingConfirmation | null
  trace: string
}

/** One live proposal per tool: a newer one supersedes any older card still pending. */
async function supersedePending(userId: string, toolName: string) {
  await createSupabaseAdminClient()
    .from("dante_tool_actions")
    .update({ status: "cancelled", result: { supersededBy: "newer proposal" } })
    .eq("user_id", userId)
    .eq("status", "pending")
    .eq("tool_name", toolName)
}

async function propose(supabase: SupabaseClient, userId: string, now: Date, toolName: string, args: unknown, summary: string, details: ChatStreamPendingConfirmation["details"]): Promise<ChatStreamPendingConfirmation> {
  await supersedePending(userId, toolName)
  const pending = await createPendingAction(supabase, userId, toolName, args, summary, now)
  return { actionId: pending.actionId, toolName, summary: pending.summary, details }
}

const REVIEW_LINE = { en: "Review it below — nothing has changed yet.", vi: "Xem lại bên dưới — hiện chưa có gì thay đổi." }

/* ---------------------------------------------------------------- availability */

async function availabilityTurn(input: { supabase: SupabaseClient; userId: string; now: Date; timezone: string; language: Lang; change: Extract<AdaptiveChange, { kind: "AVAILABILITY" }> }): Promise<AdaptiveTurnResult> {
  const { supabase, userId, now, language, change } = input
  const vi = language === "vi"
  const n = change.daysPerWeek
  const built = await buildScheduleProposal({ supabase, userId, now, daysPerWeek: n, weekdays: change.weekdays, temporary: change.temporal === "TEMPORARY", language })
  const ack = change.correction
    ? vi ? `Đã hiểu — ${n} buổi/tuần, không phải con số trước.` : `Got it — ${perWeek(n, "en")}, not what I had before.`
    : vi ? `Đã hiểu — ${n} buổi/tuần${change.temporal === "TEMPORARY" ? " trong thời gian này" : ""}.` : `Got it — ${n} day${n === 1 ? "" : "s"} a week${change.temporal === "TEMPORARY" ? " for now" : " from now on"}.`
  const parts = [ack]
  let pending: ChatStreamPendingConfirmation | null = null

  if (built.status === "NO_PLAN" || built.status === "NO_TRAINING_DAYS") {
    parts.push(vi
      ? "Bạn chưa có kế hoạch tập nào đang dùng, nên chưa có lịch nào để đổi. Hãy tạo một kế hoạch trên trang Tập luyện với số buổi này, rồi mình có thể điều chỉnh nó cho bạn."
      : "You don't have an active workout plan yet, so there's no schedule for me to change. Build one on the Workouts page with that many days, and I can adjust it for you from there.")
  } else if (built.status === "UNAVAILABLE") {
    parts.push(vi ? "Mình không đọc được kế hoạch tập lúc này, nên chưa đề xuất được gì. Chưa có gì thay đổi — thử lại sau ít phút." : "I couldn't read your workout plan just now, so I can't propose a change. Nothing has changed — try again in a moment.")
  } else if (built.status === "UNCHANGED") {
    const week = describeWeek(built.change.days.map((day) => ({ name: day.name, weekday: day.after })), language)
    parts.push(vi ? `${built.planName} đã là ${n} buổi/tuần (${week}), nên không cần đổi gì.` : `${built.planName} is already set up for ${perWeek(n, "en")} (${week}), so there's nothing to change.`)
  } else if (built.status === "HOLD") {
    parts.push(vi
      ? `Hôm nay việc tập đang tạm dừng (${built.hold === "recovery" ? "check-in báo đau/ốm" : "check-in đau/ốm chưa xác nhận được"}), nên mình chưa thêm buổi tập. Kế hoạch giữ ${built.beforeDaysPerWeek} buổi/tuần — khi việc tạm dừng kết thúc, nhắn lại và mình sẽ đề xuất.`
      : `Training is on hold today (${built.hold === "recovery" ? "your check-in flagged pain or illness" : "today's pain/illness check-in couldn't be confirmed"}), so I won't add training days right now. Your plan stays at ${perWeek(built.beforeDaysPerWeek, "en")} — ask again once the hold clears.`)
  } else {
    const days = built.change.days
    const rotation = built.change.shape === "ROTATION"
    if (rotation && days.length > n) {
      parts.push(vi
        ? `Kế hoạch ${built.args.planName} có ${days.length} buổi, nên với ${n} buổi/tuần mình đề xuất chạy theo vòng: mỗi lần tập bạn làm buổi tiếp theo. Bài tập giữ nguyên; mỗi nhóm cơ chỉ được tập thưa hơn.`
        : `${built.args.planName} has ${days.length} workouts, so at ${perWeek(n, "en")} I'd run them as a rotation: each time you train, you do the next one. The workouts stay the same; each muscle just gets trained a bit less often.`)
      if (change.weekdays !== null) {
        parts.push(vi ? `Ngày cố định cần một kế hoạch có đúng ${n} buổi — bạn có thể tạo trên trang Tập luyện.` : `Fixed days need a plan with exactly ${n} workouts — you can build one on the Workouts page.`)
      }
    } else if (rotation) {
      parts.push(vi
        ? `Kế hoạch có ${days.length} buổi, nên với ${n} buổi/tuần các buổi sẽ lặp lại theo vòng (${days.map((day) => day.name).join(" → ")}).`
        : `Your plan has ${days.length} workout${days.length === 1 ? "" : "s"}, so at ${perWeek(n, "en")} they repeat in rotation (${days.map((day) => day.name).join(" → ")}).`)
    } else {
      const pinned = days.map((day) => `${day.name} ${vi ? "vào" : "on"} ${weekdayName(day.after!, language)}`).join(", ")
      parts.push(vi ? `Mình đề xuất cố định: ${pinned}.` : `I'd pin them to fixed days: ${pinned}.`)
      if (!change.weekdays) parts.push(vi ? `Muốn ngày khác, cứ nói, ví dụ "thứ 3, thứ 5, thứ 7".` : `Want different days? Say which, e.g. "Tue, Thu, Sat".`)
    }
    // Today's effect, from the same weekday rule planned-day.ts uses.
    const todayWd = new Date(`${localDateTimeParts(now, input.timezone).localDate}T12:00:00Z`).getUTCDay()
    if (!rotation && days.every((day) => day.after !== todayWd) && days.some((day) => day.before === todayWd)) {
      parts.push(vi ? "Nếu chấp nhận, hôm nay sẽ thành ngày nghỉ trong kế hoạch." : "If you accept, today becomes a rest day in your plan.")
    }
    parts.push(vi ? "Mình đã đặt thay đổi bên dưới để bạn duyệt — hiện chưa có gì thay đổi." : "I've put the change below for you to review — nothing has changed yet.")
    pending = await propose(supabase, userId, now, "update_training_schedule", built.args, built.summary, describeScheduleProposal(built.args))
  }

  // Nutrition is reviewed, never changed by a schedule change.
  const nutrition = await loadNutritionContext(supabase, userId).catch(() => null)
  if (nutrition?.plan) {
    const activity = ACTIVITY_LEVEL_LABELS[nutrition.plan.input.activityLevel]
    parts.push(vi
      ? `Mục tiêu ${nutrition.plan.target.calories} kcal/ngày giữ nguyên — nó dựa trên mức vận động ("${activity}"), không phải số buổi tập. Nếu vận động hằng ngày cũng giảm, nhắn mình xem lại.`
      : `Your ${nutrition.plan.target.calories} kcal daily target stays as it is — it's set by your activity level ("${activity}"), not the number of sessions. If your day-to-day activity drops too, ask me to review it.`)
  }

  return { draft: parts.join("\n\n"), pendingConfirmation: pending, trace: `adaptive:kind=availability;days=${n};temporal=${change.temporal};correction=${change.correction ? 1 : 0};build=${built.status}` }
}

/* ---------------------------------------------------------------- calorie target */

type Calibration = NonNullable<Awaited<ReturnType<typeof readCalibration>>>

/** The calibration engine's verdict in the reply's language (its own messages are English-only). */
function calibrationText(result: Calibration, language: Lang): string {
  if (language === "en") return result.message
  switch (result.status) {
    case "insufficient_data":
      return "Chưa đủ số lần cân: cần ít nhất 4 lần cân trong mỗi tuần của hai tuần gần nhất. Cứ tiếp tục theo dõi — chưa cần đổi gì."
    case "maintain":
      return "Xu hướng cân nặng hai tuần qua chưa cho thấy cần đổi — giữ mục tiêu hiện tại và xem lại tuần sau."
    case "intake_mismatch":
      return "Lượng ăn bạn ghi lại chưa khớp với mục tiêu, nên xu hướng cân nặng có thể đến từ lượng ăn chứ không phải mục tiêu — giữ mục tiêu và ăn sát mục tiêu hơn."
    case "limit":
      return "Điều chỉnh thêm sẽ vượt giới hạn ứng dụng tự đề xuất — hãy xem lại cài đặt hoặc hỏi chuyên gia."
    case "propose":
      return `Xu hướng cân nặng hai tuần qua cho thấy nên ${result.deltaKcal < 0 ? "giảm" : "tăng"} ${Math.abs(result.deltaKcal)} kcal/ngày.`
  }
}

async function calorieTurn(input: { supabase: SupabaseClient; userId: string; language: Lang; now: Date; change: Extract<AdaptiveChange, { kind: "CALORIE_TARGET" }>; blockDecrease: boolean }): Promise<AdaptiveTurnResult> {
  const { supabase, userId, language, change } = input
  const vi = language === "vi"
  let context: NutritionContext | null = null
  try {
    context = await loadNutritionContext(supabase, userId)
  } catch {
    context = null
  }
  const plan = context?.plan ?? null
  if (!context || !plan) {
    return {
      draft: vi
        ? "Mình chưa đọc được mục tiêu dinh dưỡng của bạn (hồ sơ có thể còn thiếu chiều cao, cân nặng hoặc tuổi), nên chưa đề xuất được thay đổi nào. Chưa có gì thay đổi — bạn có thể kiểm tra trang Dinh dưỡng."
        : "I couldn't read your nutrition target (your profile may be missing height, weight or age), so I can't propose a change. Nothing has changed — you can check your Nutrition page.",
      pendingConfirmation: null,
      trace: "adaptive:kind=calories;build=NO_PLAN",
    }
  }

  const today = await loadFoodLogForDate(supabase, userId).catch(() => null)
  const logged = today && !today.unavailable ? Math.round(today.totals.calories) : null
  const target = plan.target.calories
  const parts: string[] = []
  parts.push(vi
    ? `Mục tiêu hằng ngày của bạn là ${target} kcal${logged !== null ? ` (hôm nay đã ghi ${logged} kcal, còn ${Math.max(0, target - logged)} kcal)` : ""}.`
    : `Your daily target is ${target} kcal${logged !== null ? ` (today: ${logged} kcal logged, ${Math.max(0, target - logged)} kcal left)` : ""}.`)
  if (change.reason) {
    parts.push(vi
      ? `${change.reason === "REST_DAY" ? "Một ngày nghỉ" : "Tập ít hơn hay bỏ một buổi"} không tự động có nghĩa là phải ăn ít đi: mục tiêu là mức trung bình mỗi ngày, không cộng thêm theo từng buổi tập.`
      : `${change.reason === "REST_DAY" ? "A rest day" : "Training less or skipping a session"} doesn't automatically mean eating less: the target is a daily average, with nothing added per workout.`)
  }

  let wanted: number | null = null
  let reason = ""
  let uncertainty: string | null = vi ? "Đây là mục tiêu ước tính; hãy theo dõi cân nặng 1–2 tuần trước khi đổi tiếp." : "This is an estimate-based target; watch your weight trend for 1–2 weeks before changing it again."
  if (change.request.mode === "DELTA") {
    wanted = target + change.request.deltaKcal
    reason = vi ? `Bạn yêu cầu ${change.request.deltaKcal > 0 ? "tăng" : "giảm"} ${Math.abs(change.request.deltaKcal)} kcal/ngày.` : `You asked to ${change.request.deltaKcal > 0 ? "raise" : "lower"} it by ${Math.abs(change.request.deltaKcal)} kcal/day.`
  } else if (change.request.mode === "ABSOLUTE") {
    wanted = change.request.targetKcal
    reason = vi ? `Bạn yêu cầu đặt mục tiêu ${change.request.targetKcal} kcal/ngày.` : `You asked for a ${change.request.targetKcal} kcal/day target.`
  } else {
    // A review ask: only the weight-trend calibration can justify a number (lib/nutrition/calibration.ts).
    const calibration = await readCalibration(supabase, userId, context)
    if (calibration?.status === "propose") {
      // The weigh-ins, not the workout, are the reason — say so, so it never reads as "you skipped, so eat less".
      parts.push(vi
        ? `Riêng cân nặng thì khác: hai tuần qua cho thấy nên ${calibration.deltaKcal < 0 ? "giảm" : "tăng"} ${Math.abs(calibration.deltaKcal)} kcal/ngày (chi tiết bên dưới).`
        : `Your weigh-ins are a separate matter: the last two weeks point to ${calibration.deltaKcal < 0 ? "lowering" : "raising"} it by ${Math.abs(calibration.deltaKcal)} kcal/day (details below).`)
      wanted = calibration.proposedTargetCalories
      reason = calibrationText(calibration, language)
      uncertainty = vi ? uncertainty : calibration.uncertainty ?? uncertainty
    } else {
      parts.push(calibration
        ? vi ? `Mình không thấy lý do để đổi lúc này: ${calibrationText(calibration, language)}` : `I don't see a reason to change it right now: ${calibration.message}`
        : vi ? "Mình chưa có đủ dữ liệu cân nặng để thấy lý do đổi, nên giữ nguyên là hợp lý." : "I don't have the weigh-in data to see a reason to change it, so keeping it is reasonable.")
      parts.push(vi ? `Nếu bạn vẫn muốn một con số khác, cứ nói (ví dụ "giảm 150 kcal") và mình sẽ chuẩn bị để bạn duyệt.` : `If you still want a different number, tell me (e.g. "lower my calories by 150") and I'll set it up for you to review.`)
      return { draft: parts.join("\n\n"), pendingConfirmation: null, trace: `adaptive:kind=calories;mode=REVIEW;calibration=${calibration?.status ?? "unavailable"}` }
    }
  }

  if (input.blockDecrease && wanted < target) {
    parts.push(vi
      ? "Vì những gì bạn chia sẻ trước đó về việc ăn uống, mình sẽ không đề xuất giảm calo ở đây. Một chuyên gia dinh dưỡng hoặc bác sĩ có thể giúp bạn đặt mục tiêu phù hợp."
      : "Because of what you shared earlier about eating, I won't set up a calorie reduction here. A dietitian or doctor can help you set a target that's right for you.")
    return { draft: parts.join("\n\n"), pendingConfirmation: null, trace: "adaptive:kind=calories;build=BLOCKED_DECREASE" }
  }

  const built: CalorieBuild = await buildCalorieProposal({ supabase, userId, targetKcal: wanted, reason, uncertainty, language, context })
  if (built.status === "PROPOSAL") {
    if (built.limitNote) parts.push(built.limitNote)
    const a = built.args
    parts.push(vi
      ? `Đề xuất: ${a.proposedTargetKcal} kcal/ngày${a.after.protein === a.before.protein ? `, đạm giữ ${a.after.protein} g` : ""}. ${REVIEW_LINE.vi}`
      : `Proposed: ${a.proposedTargetKcal} kcal/day${a.after.protein === a.before.protein ? `, protein stays at ${a.after.protein} g` : ""}. ${REVIEW_LINE.en}`)
    const pending = await propose(supabase, userId, input.now, "update_calorie_target", a, built.summary, describeCalorieProposal(a))
    return { draft: parts.join("\n\n"), pendingConfirmation: pending, trace: `adaptive:kind=calories;mode=${change.request.mode};build=PROPOSAL;to=${a.proposedTargetKcal}` }
  }
  parts.push(built.status === "UNCHANGED"
    ? built.limitNote ?? (vi ? "Đó đã là mục tiêu hiện tại của bạn, nên không cần đổi." : "That's already your current target, so there's nothing to change.")
    : vi ? "Mình không chuẩn bị được thay đổi lúc này. Chưa có gì thay đổi." : "I couldn't prepare that change just now. Nothing has changed.")
  return { draft: parts.join("\n\n"), pendingConfirmation: null, trace: `adaptive:kind=calories;mode=${change.request.mode};build=${built.status}` }
}

export async function runAdaptiveChangeTurn(input: {
  supabase: SupabaseClient
  userId: string
  now: Date
  timezone: string
  language: Lang
  change: AdaptiveChange
  /** An active eating-disorder / very-low-intake context: never propose a reduction. */
  blockDecrease: boolean
}): Promise<AdaptiveTurnResult> {
  return input.change.kind === "AVAILABILITY"
    ? availabilityTurn({ ...input, change: input.change })
    : calorieTurn({ ...input, change: input.change })
}
