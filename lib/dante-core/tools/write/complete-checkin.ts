import "server-only";

import { z } from "zod";

import { computeRecoveryScore, RECOVERY_STATUS_LABEL } from "@/lib/recovery/score";
import type { DanteTool } from "@/lib/dante-core/tools/types";
import { localDateTimeParts } from "@/lib/training/load-today-session";
import { addDaysIso } from "@/lib/nutrition/date-utils";

const scaleField = z.number().finite().int().min(1).max(10).nullable().optional();

const inputSchema = z
  .object({
    sleepHours: z.number().finite().min(0).max(24).nullable().optional(),
    sleepQuality: scaleField,
    stress: scaleField,
    fatigue: scaleField,
    soreness: scaleField,
    mood: scaleField,
    readiness: scaleField,
    painIllness: z.enum(["no", "minor", "yes"]).default("no"),
    notes: z.string().max(600).nullable().optional(),
  })
  .strict();

export type CompleteCheckinInput = z.infer<typeof inputSchema>;
export type CompleteCheckinToolOutput = { score: number | null; status: string | null };

/**
 * complete_checkin — same deterministic scoring
 * (lib/recovery/score.ts::computeRecoveryScore, Part 15/18: Dante
 * never invents or adjusts this) and the SAME upsert-by-day semantics
 * as app/api/recovery/checkin/route.ts, so Dante submitting a
 * check-in on the user's behalf produces exactly the row a manual
 * check-in would. `onConflict: "user_id,checkin_date"` makes this
 * naturally idempotent — confirming twice the same day overwrites the
 * same row rather than creating a duplicate (Part 9).
 */
export const completeCheckinTool: DanteTool<CompleteCheckinInput, CompleteCheckinToolOutput> = {
  name: "complete_checkin",
  description: "Submit today's recovery check-in (sleep, stress, fatigue, soreness, mood, readiness, pain/illness) on the user's behalf, using values they explicitly told you.",
  inputSchema,
  mode: "write",
  risk: "low",
  requiresConfirmation: true,

  summarize() {
    return "Submit today's recovery check-in";
  },

  async execute(context, input) {
    const { supabase, userId, now, timezone } = context;
    // Same local calendar date as POST /api/recovery/checkin — never UTC
    // `.toISOString().slice(0, 10)`, which writes yesterday's row for any
    // user ahead of UTC in the early morning (e.g. Asia/Singapore).
    const checkinDate =
      context.temporalContext?.localDate ??
      localDateTimeParts(now, timezone || "UTC").localDate;

    const { data: historyRows, error: historyError } = await supabase
      .from("recovery_checkins")
      .select("checkin_date, recovery_score")
      .eq("user_id", userId)
      .gte("checkin_date", addDaysIso(checkinDate, -29))
      .lt("checkin_date", checkinDate)
      .order("checkin_date", { ascending: false })
      .limit(30);

    if (historyError) {
      return { ok: false, error: historyError.message };
    }

    const history = ((historyRows as Array<{ recovery_score: number | null }> | null) ?? []).map((row) => ({
      score: row.recovery_score,
    }));

    const result = computeRecoveryScore(
      {
        sleepHours: input.sleepHours ?? null,
        sleepQuality: input.sleepQuality ?? null,
        stress: input.stress ?? null,
        fatigue: input.fatigue ?? null,
        soreness: input.soreness ?? null,
        mood: input.mood ?? null,
        readiness: input.readiness ?? null,
        restingHr: null,
        steps: null,
        painIllness: input.painIllness,
        notes: input.notes ?? null,
      },
      history,
    );

    const { error } = await supabase
      .from("recovery_checkins")
      .upsert(
        {
          user_id: userId,
          checkin_date: checkinDate,
          sleep_hours: input.sleepHours ?? null,
          sleep_quality: input.sleepQuality ?? null,
          stress: input.stress ?? null,
          fatigue: input.fatigue ?? null,
          soreness: input.soreness ?? null,
          mood: input.mood ?? null,
          readiness: input.readiness ?? null,
          pain_illness: input.painIllness,
          notes: input.notes ?? null,
          recovery_score: result.score,
          score_breakdown: result.drivers,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,checkin_date" },
      );

    if (error) {
      return { ok: false, error: error.message };
    }

    return {
      ok: true,
      data: { score: result.score, status: result.status !== null ? RECOVERY_STATUS_LABEL[result.status] : null },
    };
  },
};
