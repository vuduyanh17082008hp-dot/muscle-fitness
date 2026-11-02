import "server-only";

import { z } from "zod";

import { buildCalorieProposal, describeCalorieProposal, type CalorieArgs } from "@/lib/dante-core/adaptive-proposals";
import type { DanteTool } from "@/lib/dante-core/tools/types";
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";
import { MAX_CALIBRATION_ADJUSTMENT_KCAL } from "@/lib/nutrition/plan";

const macro = z.object({ calories: z.number().int(), protein: z.number(), carbs: z.number(), fat: z.number() }).strict();
const inputSchema = z
  .object({
    expectedTargetKcal: z.number().int().min(800).max(8000),
    expectedAdjustmentKcal: z.number().int().min(-MAX_CALIBRATION_ADJUSTMENT_KCAL).max(MAX_CALIBRATION_ADJUSTMENT_KCAL),
    nextAdjustmentKcal: z.number().int().min(-MAX_CALIBRATION_ADJUSTMENT_KCAL).max(MAX_CALIBRATION_ADJUSTMENT_KCAL),
    proposedTargetKcal: z.number().int().min(800).max(8000),
    before: macro,
    after: macro,
    reason: z.string().min(1).max(400),
    uncertainty: z.string().max(400).nullable(),
    language: z.enum(["en", "vi"]),
  })
  .strict();

export type UpdateCalorieTargetOutput = { targetKcal: number; previousTargetKcal: number; adjustmentKcal: number; message: string };

/**
 * update_calorie_target (MF-S1) — the Accept of a calorie-target proposal. Not model-selectable.
 *
 * The daily target stays computed by lib/nutrition/plan.ts; this writes only the user-accepted offset it already reads
 * (user_preferences.calorie_adjustment_kcal — the same column the weight-trend calibration accept writes), with the
 * user's own client:
 *   1. re-read the nutrition context: the target and the offset must still be what the proposal was built on (STALE);
 *   2. one conditional UPDATE on the old offset (a concurrent change makes it 0 rows → STALE, nothing written);
 *   3. read the context back and require the engine's new target to equal the proposed one.
 * calorie_calibration_reviewed_at is left alone: a manual change is not a weight-trend review.
 */
export const updateCalorieTargetTool: DanteTool<CalorieArgs, UpdateCalorieTargetOutput> = {
  name: "update_calorie_target",
  description: "Set the user's daily calorie target to an accepted value (via the engine's accepted adjustment).",
  inputSchema,
  mode: "write",
  risk: "medium",
  requiresConfirmation: true,

  summarize(input) {
    return `Change your daily calorie target to ${input.proposedTargetKcal} kcal`;
  },

  describe: describeCalorieProposal,

  async revise(context, input, value) {
    if (!Number.isFinite(value)) return { ok: false, error: "Enter a calorie target in kcal." };
    const built = await buildCalorieProposal({
      supabase: context.supabase,
      userId: context.userId,
      targetKcal: value,
      reason: input.reason,
      uncertainty: input.uncertainty,
      language: input.language,
    });
    const vi = input.language === "vi";
    if (built.status === "PROPOSAL") return { ok: true, args: built.args, summary: built.summary };
    if (built.status === "UNCHANGED") return { ok: false, error: built.limitNote ?? (vi ? "Đó đã là mục tiêu hiện tại — không có gì để đổi." : "That's already your current target — nothing to change.") };
    return { ok: false, error: vi ? "Không đọc được kế hoạch dinh dưỡng lúc này. Chưa có gì thay đổi." : "Your nutrition plan couldn't be read just now. Nothing was changed." };
  },

  async execute(context, input) {
    const { supabase, userId } = context;
    const vi = input.language === "vi";
    const stale = {
      ok: false as const,
      code: "ACTION_STALE" as const,
      error: vi ? "Mục tiêu calo đã thay đổi kể từ khi đề xuất, nên đề xuất này đã cũ. Chưa có gì thay đổi — hãy hỏi lại." : "Your calorie target changed since this was proposed, so this proposal is out of date. Nothing was changed — ask me again.",
    };

    const context0 = await loadNutritionContext(supabase, userId).catch(() => null);
    const plan = context0?.plan ?? null;
    if (!context0 || !plan || !context0.calibration.available || context0.unavailable?.includes("preferences")) {
      return { ok: false, error: vi ? "Không đọc được kế hoạch dinh dưỡng. Chưa có gì thay đổi." : "Your nutrition plan couldn't be read. Nothing was changed." };
    }
    if (plan.target.calories !== input.expectedTargetKcal || plan.calorieAdjustmentKcal !== input.expectedAdjustmentKcal) return stale;

    const updated = await supabase
      .from("user_preferences")
      .update({ calorie_adjustment_kcal: input.nextAdjustmentKcal })
      .eq("user_id", userId)
      .eq("calorie_adjustment_kcal", input.expectedAdjustmentKcal)
      .select("user_id");
    if (updated.error) return { ok: false, error: vi ? "Không lưu được mục tiêu mới. Chưa có gì thay đổi." : "The new target couldn't be saved. Nothing was changed." };
    if ((updated.data ?? []).length === 0) {
      // A never-saved user has no preferences row (offset 0): create it. Anything else means it changed under us.
      if (input.expectedAdjustmentKcal !== 0) return stale;
      const inserted = await supabase.from("user_preferences").insert({ user_id: userId, calorie_adjustment_kcal: input.nextAdjustmentKcal });
      if (inserted.error) return stale;
    }

    const context1 = await loadNutritionContext(supabase, userId).catch(() => null);
    const target = context1?.plan?.target.calories ?? null;
    if (target !== input.proposedTargetKcal) {
      return { ok: false, error: vi ? "Không xác nhận được mục tiêu mới từ kế hoạch dinh dưỡng. Hãy kiểm tra trang Dinh dưỡng." : "The new target couldn't be confirmed from your nutrition plan. Please check your Nutrition page." };
    }
    const after = context1!.plan!.target;
    return {
      ok: true,
      data: {
        targetKcal: target,
        previousTargetKcal: input.expectedTargetKcal,
        adjustmentKcal: input.nextAdjustmentKcal,
        message: vi
          ? `Đã cập nhật: mục tiêu hằng ngày giờ là ${target} kcal (P ${after.protein} g · C ${after.carbs} g · F ${after.fat} g).`
          : `Updated: your daily target is now ${target} kcal (P ${after.protein} g · C ${after.carbs} g · F ${after.fat} g).`,
      },
    };
  },
};
