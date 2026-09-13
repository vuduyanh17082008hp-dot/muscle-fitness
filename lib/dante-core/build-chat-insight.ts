import type { RecoveryContext } from "@/lib/recovery/load-recovery-context";
import { RECOVERY_STATUS_LABEL } from "@/lib/recovery/score";
import type { DanteInsight, EvidenceItem } from "@/lib/dante-core/insight";

/**
 * "Why This?" insight builders for chat responses (spec: Explainable
 * Recommendation Model). Each function only assembles evidence that
 * was ALREADY computed deterministically elsewhere (the recovery
 * engine, the food-log comparison) — nothing here recomputes a score,
 * a target, or invents a value. Returns null whenever there isn't a
 * real, meaningfully evidenced recommendation to show, rather than
 * padding the panel with placeholders.
 */

function driverEvidence(recovery: RecoveryContext): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const row = recovery.today;
  const baseline = recovery.todayScoreResult.baseline;

  if (row?.sleep_hours !== null && row?.sleep_hours !== undefined) {
    items.push({
      label: "Sleep",
      value: `${row.sleep_hours} h`,
      note:
        baseline && baseline.trend === "below" && recovery.averages7Days.sleepHours !== null
          ? "Below recent baseline"
          : null,
    });
  }

  if (row?.soreness !== null && row?.soreness !== undefined) {
    items.push({
      label: "Soreness",
      value: `${row.soreness} / 10`,
      note: row.soreness >= 7 ? "High" : null,
    });
  }

  if (row?.stress !== null && row?.stress !== undefined) {
    items.push({
      label: "Stress",
      value: `${row.stress} / 10`,
      note: row.stress >= 7 ? "High" : null,
    });
  }

  if (row?.readiness !== null && row?.readiness !== undefined) {
    items.push({
      label: "Readiness",
      value: `${row.readiness} / 10`,
      note:
        recovery.todayScoreResult.status !== null
          ? RECOVERY_STATUS_LABEL[recovery.todayScoreResult.status]
          : null,
    });
  }

  if (recovery.trainingLoad.reason) {
    items.push({
      label: "Recent load",
      value: recovery.trainingLoad.reason,
    });
  }

  return items;
}

/**
 * Only returns an insight when the deterministic training-load engine
 * (lib/recovery/training-load.ts) has flagged something worth acting
 * on (amber/red) — a normal "green" day has nothing worth a "Why
 * This?" panel, so this returns null rather than manufacture one.
 */
export function buildRecoveryInsight(recovery: RecoveryContext): DanteInsight | null {
  if (recovery.today === null) return null;
  if (recovery.trainingLoad.state === "green") return null;

  const evidence = driverEvidence(recovery);
  if (evidence.length === 0) return null;

  const action =
    recovery.trainingLoad.state === "red"
      ? "Consider reducing today's training volume or intensity."
      : "Maintain training quality, but trim any non-essential volume today.";

  return {
    id: "insight-recovery-load",
    action,
    category: "recovery",
    severity: recovery.trainingLoad.state === "red" ? "warning" : "notice",
    reasons: recovery.todayScoreResult.drivers
      .filter((driver) => driver.available)
      .sort((a, b) => a.score - b.score)
      .slice(0, 2)
      .map((driver) => `${driver.label} scored ${driver.score}/100 today.`),
    evidence,
    confidence: recovery.todayScoreResult.baseline && recovery.todayScoreResult.baseline.sampleSize >= 5 ? "moderate" : "low",
    nextAction: { label: "View recovery", href: "/dashboard/recovery" },
  };
}

export type NutritionInsightInput = {
  hasTarget: boolean;
  proteinTargetG: number | null;
  proteinConsumedG: number | null;
};

/**
 * Only returns an insight when there's a real deficit worth flagging.
 * A met/exceeded target or a missing plan has nothing actionable to
 * show, so this returns null.
 */
export function buildNutritionInsight(input: NutritionInsightInput): DanteInsight | null {
  if (!input.hasTarget || input.proteinTargetG === null || input.proteinConsumedG === null) {
    return null;
  }

  const remaining = Math.round(input.proteinTargetG - input.proteinConsumedG);
  if (remaining <= 0) return null;

  return {
    id: "insight-nutrition-protein",
    action: `You're ${remaining} g short of your protein target today.`,
    category: "nutrition",
    severity: "info",
    reasons: [],
    evidence: [
      { label: "Protein target", value: `${input.proteinTargetG} g` },
      { label: "Protein consumed", value: `${Math.round(input.proteinConsumedG)} g` },
    ],
    confidence: "high",
    nextAction: { label: "Find a meal", href: "/dashboard/nutrition" },
  };
}
