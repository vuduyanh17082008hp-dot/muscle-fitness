import "server-only";

import { z } from "zod";

import { buildScheduleProposal, describeScheduleProposal, type ScheduleArgs } from "@/lib/dante-core/adaptive-proposals";
import { currentTrainingHold, TRAINING_HOLD_MESSAGE } from "@/lib/dante-core/server/training-hold-guard";
import type { DanteTool } from "@/lib/dante-core/tools/types";
import { describeWeek, perWeek } from "@/lib/training/schedule-change";

const weekday = z.number().int().min(0).max(6).nullable();
const inputSchema = z
  .object({
    planId: z.string().uuid(),
    planName: z.string().min(1).max(160),
    beforeDaysPerWeek: z.number().int().min(1).max(7),
    daysPerWeek: z.number().int().min(1).max(7),
    temporary: z.boolean(),
    days: z.array(z.object({ dayId: z.string().uuid(), name: z.string().min(1).max(160), before: weekday, after: weekday }).strict()).min(1).max(14),
    language: z.enum(["en", "vi"]),
  })
  .strict();

export type UpdateTrainingScheduleOutput = { planId: string; daysPerWeek: number; week: string; message: string };

type DayRow = { id: string; scheduled_weekday: number | null };

/**
 * update_training_schedule (MF-S1) — the Accept of a "my availability changed" proposal. Not model-selectable
 * (SPECIALIST_COACH_TOOLS): only lib/dante-core/adaptive-change-turn.ts writes its pending row.
 *
 * Writes with the user's own client (RLS can_manage_workout_client), never the service role:
 *   1. re-read the plan: still active, still this user's, days/week unchanged since the proposal (else STALE);
 *   2. every day's weekday must still equal the proposal's "before" (else STALE — someone edited the plan);
 *   3. a days/week increase is refused while a training hold stands (it adds training);
 *   4. each day row is a compare-and-swap on its old weekday; any failure restores the rows already changed;
 *   5. the plan's days_per_week and the profile's training_days follow; the week is read back and compared.
 * ponytail: no RPC, so it is not one DB transaction — partial failure is rolled back by hand and reported if that fails.
 */
export const updateTrainingScheduleTool: DanteTool<ScheduleArgs, UpdateTrainingScheduleOutput> = {
  name: "update_training_schedule",
  description: "Re-pin the active plan's training days to new weekdays / days per week, after the user accepts.",
  inputSchema,
  mode: "write",
  risk: "medium",
  requiresConfirmation: true,

  summarize(input) {
    return `Change ${input.planName} to ${perWeek(input.daysPerWeek, "en")}`;
  },

  describe: describeScheduleProposal,

  async revise(context, input, value) {
    const days = Math.round(value);
    if (!Number.isInteger(days) || days < 1 || days > 7) return { ok: false, error: "Days per week must be between 1 and 7." };
    // Named weekdays only survive an edit that keeps their count.
    const named = input.days.every((day) => day.after !== null) ? input.days.map((day) => day.after as number) : null;
    const built = await buildScheduleProposal({
      supabase: context.supabase,
      userId: context.userId,
      now: context.now,
      daysPerWeek: days,
      weekdays: named && named.length === days ? named : null,
      temporary: input.temporary,
      language: input.language,
    });
    if (built.status === "PROPOSAL") return { ok: true, args: built.args, summary: built.summary };
    const vi = input.language === "vi";
    if (built.status === "UNCHANGED") return { ok: false, error: vi ? `Kế hoạch đã ở ${days} buổi/tuần — không có gì để đổi.` : `Your plan is already at ${perWeek(days, "en")} — nothing to change.` };
    if (built.status === "HOLD") return { ok: false, error: vi ? "Việc tập đang tạm dừng, nên không thể thêm buổi tập lúc này." : "Training is on hold, so training days can't be added right now." };
    return { ok: false, error: vi ? "Không đọc được kế hoạch tập lúc này. Chưa có gì thay đổi." : "Your workout plan couldn't be read just now. Nothing was changed." };
  },

  async execute(context, input) {
    const { supabase, userId } = context;
    const vi = input.language === "vi";
    const stale = (why: string) => ({
      ok: false as const,
      code: "ACTION_STALE" as const,
      error: vi ? `Kế hoạch tập đã thay đổi kể từ khi đề xuất (${why}), nên đề xuất này đã cũ. Chưa có gì thay đổi — hãy hỏi lại.` : `Your plan changed since this was proposed (${why}), so this proposal is out of date. Nothing was changed — ask me again.`,
    });

    if (input.daysPerWeek > input.beforeDaysPerWeek) {
      const hold = await currentTrainingHold(supabase, userId, context.now);
      if (hold) return { ok: false, error: `${TRAINING_HOLD_MESSAGE[hold].split(" — ")[0]}. Adding training days wasn't applied.` };
    }

    const { data: plan, error: planError } = await supabase
      .from("workout_plans")
      .select("id, days_per_week, status")
      .eq("id", input.planId)
      .eq("client_id", userId)
      .maybeSingle();
    if (planError) return { ok: false, error: vi ? "Không đọc được kế hoạch tập. Chưa có gì thay đổi." : "Your plan couldn't be read. Nothing was changed." };
    if (!plan) return { ok: false, code: "ACTION_NOT_FOUND", error: vi ? "Không tìm thấy kế hoạch tập này." : "That workout plan wasn't found." };
    if (plan.status !== "active") return stale(vi ? "kế hoạch không còn đang dùng" : "it is no longer your active plan");
    if (Number(plan.days_per_week) !== input.beforeDaysPerWeek) return stale(vi ? "số buổi/tuần" : "days per week");

    const ids = input.days.map((day) => day.dayId);
    const { data: rows, error: rowsError } = await supabase.from("workout_days").select("id, scheduled_weekday").eq("workout_plan_id", input.planId).in("id", ids);
    if (rowsError || !rows) return { ok: false, error: vi ? "Không đọc được các buổi tập. Chưa có gì thay đổi." : "Your plan's days couldn't be read. Nothing was changed." };
    const current = new Map((rows as DayRow[]).map((row) => [row.id, row.scheduled_weekday]));
    if (input.days.some((day) => !current.has(day.dayId) || current.get(day.dayId) !== day.before)) return stale(vi ? "lịch các buổi" : "a day's weekday");

    const changed: typeof input.days = [];
    const restore = async () => {
      let ok = true;
      for (const day of changed) {
        const { error } = await supabase.from("workout_days").update({ scheduled_weekday: day.before }).eq("id", day.dayId).eq("workout_plan_id", input.planId);
        if (error) ok = false;
      }
      return ok;
    };
    const failed = async (what: string) => {
      const restored = await restore();
      return {
        ok: false as const,
        error: restored
          ? vi ? `Không lưu được ${what}. Mọi thay đổi đã được hoàn tác — kế hoạch giữ nguyên.` : `Couldn't save ${what}. Every change was undone — your plan is as it was.`
          : vi ? `Không lưu được ${what}, và một phần lịch có thể đã đổi. Hãy kiểm tra trang Tập luyện.` : `Couldn't save ${what}, and part of the schedule may have changed. Please check your Workouts page.`,
      };
    };

    for (const day of input.days) {
      if (day.before === day.after) continue;
      let query = supabase.from("workout_days").update({ scheduled_weekday: day.after }).eq("id", day.dayId).eq("workout_plan_id", input.planId);
      query = day.before === null ? query.is("scheduled_weekday", null) : query.eq("scheduled_weekday", day.before);
      const { data, error } = await query.select("id");
      if (error || (data ?? []).length !== 1) return failed(vi ? `buổi ${day.name}` : `${day.name}`);
      changed.push(day);
    }

    const { data: planRow, error: planUpdateError } = await supabase
      .from("workout_plans")
      .update({ days_per_week: input.daysPerWeek })
      .eq("id", input.planId)
      .eq("client_id", userId)
      .eq("days_per_week", input.beforeDaysPerWeek)
      .select("id");
    if (planUpdateError || (planRow ?? []).length !== 1) return failed(vi ? "số buổi/tuần" : "the days per week");

    // The profile's stated availability follows the plan (onboarding/athlete state read it). A missing row is fine.
    const { error: profileError } = await supabase.from("fitness_profiles").update({ training_days: input.daysPerWeek }).eq("user_id", userId);
    if (profileError) console.warn("[DANTE SCHEDULE] profile training_days not updated:", profileError.code ?? "unknown");

    // Read back: success is what the rows now say, not what was sent.
    const { data: after, error: afterError } = await supabase.from("workout_days").select("id, scheduled_weekday").eq("workout_plan_id", input.planId).in("id", ids);
    const afterMap = new Map(((after ?? []) as DayRow[]).map((row) => [row.id, row.scheduled_weekday]));
    if (afterError || input.days.some((day) => afterMap.get(day.dayId) !== day.after)) {
      return { ok: false, error: vi ? "Không xác nhận được lịch mới từ kế hoạch. Hãy kiểm tra trang Tập luyện." : "The new schedule couldn't be confirmed from your plan. Please check your Workouts page." };
    }
    const week = describeWeek(input.days.map((day) => ({ name: day.name, weekday: afterMap.get(day.dayId) ?? null })), input.language);
    return {
      ok: true,
      data: {
        planId: input.planId,
        daysPerWeek: input.daysPerWeek,
        week,
        message: vi ? `Đã cập nhật: ${input.planName} giờ là ${input.daysPerWeek} buổi/tuần — ${week}.` : `Updated: ${input.planName} is now ${perWeek(input.daysPerWeek, "en")} — ${week}.`,
      },
    };
  },
};
