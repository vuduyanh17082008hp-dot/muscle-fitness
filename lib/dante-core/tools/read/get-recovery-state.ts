import "server-only";

import { z } from "zod";

import { loadRecoveryContext } from "@/lib/recovery/load-recovery-context";
import { RECOVERY_STATUS_LABEL } from "@/lib/recovery/score";
import type { DanteTool } from "@/lib/dante-core/tools/types";

const inputSchema = z.object({}).strict();

export type RecoveryStateToolOutput = {
  hasCheckinToday: boolean;
  score: number | null;
  status: string | null;
  lowestDrivers: string[];
  trainingLoad: {
    state: string;
    reason: string;
    sessionsLast7Days: number;
    restDaysLast7Days: number;
  };
};

/**
 * get_recovery_state — wraps lib/recovery/load-recovery-context.ts +
 * the deterministic computeRecoveryScore() output it already carries
 * (lib/recovery/score.ts). Dante explains this score; it is never
 * recomputed here or anywhere else in the tool layer (Part 15, Part 18).
 */
export const getRecoveryStateTool: DanteTool<Record<string, never>, RecoveryStateToolOutput> = {
  name: "get_recovery_state",
  description: "Get the user's today's recovery/readiness score, its lowest-scoring drivers, and current training-load state.",
  inputSchema,
  mode: "read",
  risk: "low",
  requiresConfirmation: false,

  async execute(context) {
    const { supabase, userId } = context;

    const recovery = await loadRecoveryContext(supabase, userId).catch(() => null);

    if (!recovery) {
      return {
        ok: true,
        data: {
          hasCheckinToday: false,
          score: null,
          status: null,
          lowestDrivers: [],
          trainingLoad: { state: "unknown", reason: "Recovery data is unavailable.", sessionsLast7Days: 0, restDaysLast7Days: 0 },
        },
      };
    }

    const { todayScoreResult, trainingLoad } = recovery;

    return {
      ok: true,
      data: {
        hasCheckinToday: recovery.today !== null,
        score: todayScoreResult.score,
        status: todayScoreResult.status !== null ? RECOVERY_STATUS_LABEL[todayScoreResult.status] : null,
        lowestDrivers: todayScoreResult.drivers
          .filter((driver) => driver.available)
          .sort((a, b) => a.score - b.score)
          .slice(0, 2)
          .map((driver) => `${driver.label}: ${driver.score}/100`),
        trainingLoad: {
          state: trainingLoad.state,
          reason: trainingLoad.reason,
          sessionsLast7Days: trainingLoad.sessionsLast7Days,
          restDaysLast7Days: trainingLoad.restDaysLast7Days,
        },
      },
    };
  },
};
