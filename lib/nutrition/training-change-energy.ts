import type { CalibrationResult } from "@/lib/nutrition/calibration"
import { ACTIVITY_LEVEL_LABELS, type NutritionPlan } from "@/lib/nutrition/plan"

/**
 * Does a modified or cancelled training session change today's energy target? Pure and deterministic.
 *
 * The target (lib/nutrition/plan.ts) is maintenance × activity level × goal: a DAILY AVERAGE over the week, with no
 * per-session add-on and no separate training/rest-day targets. So resting, trimming or swapping one session does not
 * call for eating less that day — and an injury or recovery day is a poor time to cut. The only evidence-backed change
 * the app makes is the weight-trend calibration (lib/nutrition/calibration.ts), which is applied by the user on
 * Nutrition → Plan (reviewCalorieCalibrationAction re-runs it server-side). This never proposes its own number.
 */

export type TrainingChangeKind = "REST" | "REDUCED" | "UNCHANGED"

export type TrainingChangeEnergy =
  | { decision: "UNAVAILABLE"; reason: "NO_PLAN" | "READ_FAILED" }
  | {
      decision: "KEEP" | "CALIBRATION_AVAILABLE"
      targetCalories: number
      proteinG: number
      maintenanceCalories: number
      activityLabel: string
      /** Present only when the existing weight-trend review proposes a change — never computed here. */
      calibration: { currentTargetCalories: number; proposedTargetCalories: number; deltaKcal: number } | null
      calibrationNote: string | null
    }

export function trainingChangeEnergy(input: {
  plan: Pick<NutritionPlan, "target" | "maintenanceCalories" | "input"> | null
  calibration: CalibrationResult | null
  readFailed?: boolean
}): TrainingChangeEnergy {
  if (input.readFailed) return { decision: "UNAVAILABLE", reason: "READ_FAILED" }
  if (!input.plan) return { decision: "UNAVAILABLE", reason: "NO_PLAN" }
  const base = {
    targetCalories: input.plan.target.calories,
    proteinG: input.plan.target.protein,
    maintenanceCalories: Math.round(input.plan.maintenanceCalories),
    activityLabel: ACTIVITY_LEVEL_LABELS[input.plan.input.activityLevel],
  }
  const review = input.calibration
  if (review?.status === "propose") {
    return {
      ...base,
      decision: "CALIBRATION_AVAILABLE",
      calibration: { currentTargetCalories: review.currentTargetCalories, proposedTargetCalories: review.proposedTargetCalories, deltaKcal: review.deltaKcal },
      calibrationNote: review.message,
    }
  }
  return { ...base, decision: "KEEP", calibration: null, calibrationNote: review?.status === "insufficient_data" ? review.message : null }
}

export function renderTrainingChangeEnergy(energy: TrainingChangeEnergy, change: TrainingChangeKind, language: "en" | "vi"): string {
  const vi = language === "vi"
  if (energy.decision === "UNAVAILABLE") {
    return vi
      ? "Dinh dưỡng: mình không đọc được kế hoạch dinh dưỡng của bạn lúc này, nên không nói được mục tiêu calo có cần đổi hay không. Không có gì bị thay đổi."
      : "Nutrition: I couldn't read your nutrition plan just now, so I can't say whether your calorie target should change. Nothing was changed."
  }
  const what = change === "REST"
    ? vi ? "Nghỉ hôm nay" : "Resting today"
    : change === "REDUCED"
      ? vi ? "Bỏ bớt bài hôm nay" : "Trimming today's session"
      : vi ? "Giữ nguyên buổi tập" : "Keeping the session"
  const keep = vi
    ? `Dinh dưỡng: ${what} không cần giảm calo. Mục tiêu ${energy.targetCalories} kcal của bạn là mức trung bình mỗi ngày tính từ mức vận động (${energy.activityLabel}), không cộng thêm theo từng buổi tập, và app không dùng mục tiêu riêng cho ngày tập/ngày nghỉ. Khi đang đau hoặc cần hồi phục, giữ mục tiêu và giữ protein khoảng ${energy.proteinG} g là hợp lý. Mình không thay đổi gì.`
    : `Nutrition: ${what} doesn't call for eating less. Your ${energy.targetCalories} kcal target is a daily average built from your activity level (${energy.activityLabel}), with nothing added per workout, and the app doesn't use separate training-day and rest-day targets. While something hurts or you're recovering, keeping the target and your protein around ${energy.proteinG} g is reasonable. I haven't changed anything.`
  if (energy.decision === "CALIBRATION_AVAILABLE" && energy.calibration) {
    const c = energy.calibration
    const sign = c.deltaKcal > 0 ? "+" : ""
    return `${keep} ${vi
      ? `Riêng biệt với buổi tập hôm nay: xu hướng cân nặng 2 tuần qua cho thấy nên điều chỉnh ${c.currentTargetCalories} → ${c.proposedTargetCalories} kcal (${sign}${c.deltaKcal} kcal/ngày). Đề xuất này dựa trên cân nặng, không phải vì nghỉ tập. Bạn xem và bấm Chấp nhận ở Dinh dưỡng → Kế hoạch nếu đồng ý — mục tiêu chỉ đổi khi bạn xác nhận ở đó.`
      : `Separately from today's session, your last two weeks of weigh-ins support a calibration: ${c.currentTargetCalories} → ${c.proposedTargetCalories} kcal (${sign}${c.deltaKcal} kcal/day). That comes from your weight trend, not from resting. Review it on Nutrition → Plan and tap Accept there if you agree — the target only changes when you confirm it.`}`
  }
  return keep
}
