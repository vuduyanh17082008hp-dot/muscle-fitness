import type { ContextComparison, ContextSignature } from "@/lib/dante-core/validation/types";

const SOFT_WEIGHTS: Record<keyof ContextSignature["soft"], number> = {
  trainingPhase: 1.5,
  movementFamily: 1.5,
  volumeBand: 1,
  intensityBand: 1,
  recoveryBand: 1,
  sleepBand: 0.75,
  stressBand: 0.75,
  energyBalance: 1,
  experienceBand: 0.5,
  adherenceBand: 1,
};

export function compareContext(left: ContextSignature, right: ContextSignature): ContextComparison {
  const hardMismatches: string[] = [];
  if (left.hard.athleteId !== right.hard.athleteId) hardMismatches.push("athleteId");
  if (left.hard.goal !== right.hard.goal) hardMismatches.push("goal");
  if (left.hard.acuteInjuryState !== right.hard.acuteInjuryState) hardMismatches.push("acuteInjuryState");
  if (left.hard.interventionFamily !== right.hard.interventionFamily) hardMismatches.push("interventionFamily");

  const components = (Object.keys(SOFT_WEIGHTS) as Array<keyof ContextSignature["soft"]>)
    .filter((name) => left.soft[name] !== undefined && right.soft[name] !== undefined)
    .map((name) => ({ name, matches: left.soft[name] === right.soft[name], weight: SOFT_WEIGHTS[name] }));
  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
  const matchingWeight = components.reduce((sum, item) => sum + (item.matches ? item.weight : 0), 0);
  return {
    compatible: hardMismatches.length === 0,
    score: hardMismatches.length > 0 ? 0 : totalWeight > 0 ? matchingWeight / totalWeight : 1,
    hardMismatches,
    components,
  };
}
