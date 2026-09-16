import type { VerifierFact } from "@/lib/dante-core/verifier/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Shape-only — deliberately not importing route.ts's UserContext type
 * (a Next.js route file should never be imported into lib/). Any object
 * with at least these two unknown-shaped fields (route.ts's UserContext
 * qualifies structurally) can be passed in.
 */
export type KnownFactsContextInput = {
  recovery: unknown;
  todayFoodLog: unknown;
};

/**
 * Deliberately narrow: only the specific numeric dimensions the
 * verifier's invented-athlete-metric patterns check for (recovery
 * score, readiness, sleep hours, calories/protein consumed today —
 * see lib/dante-core/verifier/checks.ts::ATHLETE_METRIC_ASSERTIONS). A
 * dimension not present here (HRV, training load) is correctly left
 * out rather than guessed, so a claim about it is correctly flagged
 * as unbacked rather than silently trusted.
 */
export function buildKnownFactsFromContext(context: KnownFactsContextInput): VerifierFact[] {
  const facts: VerifierFact[] = [];

  if (isRecord(context.recovery)) {
    const today = isRecord(context.recovery.today) ? context.recovery.today : null;
    const todayScore = today ? getNumber(today.score) : null;
    if (todayScore !== null) facts.push({ label: "recovery score", value: todayScore });

    const recent = isRecord(context.recovery.recent7DayAverages)
      ? context.recovery.recent7DayAverages
      : null;

    const sleepHours = recent ? getNumber(recent.sleepHours) : null;
    if (sleepHours !== null) facts.push({ label: "sleep hours", value: sleepHours });

    const readiness = recent ? getNumber(recent.readiness) : null;
    if (readiness !== null) facts.push({ label: "readiness score", value: readiness });
  }

  if (isRecord(context.todayFoodLog)) {
    const calories = isRecord(context.todayFoodLog.calories)
      ? getNumber(context.todayFoodLog.calories.consumed)
      : null;
    if (calories !== null) facts.push({ label: "calories", value: calories });

    const protein = isRecord(context.todayFoodLog.protein)
      ? getNumber(context.todayFoodLog.protein.consumed)
      : null;
    if (protein !== null) facts.push({ label: "protein", value: protein });
  }

  return facts;
}
