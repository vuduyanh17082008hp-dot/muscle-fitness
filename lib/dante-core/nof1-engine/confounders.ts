import { normalizeSafetyText } from "@/lib/dante-core/safety-layer";
import type { NOf1Experiment, ProtocolAdherence } from "@/lib/dante-core/nof1-engine/types";

const CONFOUNDER_MARKERS: Array<{ id: string; pattern: RegExp }> = [
  { id: "alcohol", pattern: /(?:alcohol|nhau|uong\s+ruou|drinking|di\s+nhau)/i },
  {
    id: "calorie_change",
    pattern:
      /(?:calories?\s*(?:\+|plus|up|tang|doi|changed?|increased?|increase)|(?:increased?|increase[sd]?|doi|tang)\s+calories?|tang\s+calories?|\+?\s*700|calorie\s+change)/i,
  },
  {
    id: "training_volume_change",
    pattern:
      /(?:volume\s*(?:doi|changed?|tang|giam|up|down)|(?:doi|changed?|tang|giam)\s+volume|training\s+volume\s+change)/i,
  },
  { id: "program_change", pattern: /(?:new\s+(?:split|program)|doi\s+giao\s+an|training\s+split\s+moi|new\s+training\s+split)/i },
  // Short VI token "om" must be word-bounded — otherwise it matches English "complete"/"outcome".
  { id: "illness", pattern: /(?:\bill\b|\bsick\b|\bom\b|\bbenh\b|\bflu\b)/i },
  { id: "stress_spike", pattern: /(?:stress\s+(?:spike|cao|high)|cang\s+thang\s+manh)/i },
  { id: "missed_sessions", pattern: /(?:missed\s+session|bo\s+buoi|skip(?:ped)?\s+(?:session|workout))/i },
  { id: "stimulant", pattern: /(?:extra\s+caffeine|them\s+cafe|stimulant|pre-?workout\s+them)/i },
  { id: "sleep_shortfall", pattern: /(?:only\s+slept\s+5|ngu\s+co\s+5|slept\s+5h|chi\s+ngu\s+5)/i },
];

/**
 * Detect material confounders / protocol deviations from a user turn.
 * Does not invent confounders from assistant speculation.
 */
export function detectConfoundersFromMessage(message: string): string[] {
  const text = normalizeSafetyText(message);
  const found: string[] = [];
  for (const marker of CONFOUNDER_MARKERS) {
    if (marker.pattern.test(text) || marker.pattern.test(message)) {
      found.push(marker.id);
    }
  }
  return found;
}

export function mergeConfounders(experiment: NOf1Experiment, incoming: string[]): NOf1Experiment {
  const set = new Set([...experiment.confounders, ...incoming]);
  return { ...experiment, confounders: [...set] };
}

export function assessProtocolAdherence(experiment: NOf1Experiment): ProtocolAdherence {
  if (experiment.confounders.length === 0) return "COMPLETE";
  if (experiment.confounders.length <= 1) return "PARTIAL";
  return "POOR";
}

/**
 * Apply confounders mid-experiment. Material multi-domain noise → CONFOUNDED.
 * Confounded ≠ failed.
 */
export function applyConfoundersToExperiment(
  experiment: NOf1Experiment,
  incoming: string[],
): NOf1Experiment {
  if (experiment.status !== "ACTIVE" && experiment.status !== "ACCEPTED") {
    return mergeConfounders(experiment, incoming);
  }
  const next = mergeConfounders(experiment, incoming);
  const adherence = assessProtocolAdherence(next);
  if (next.confounders.length >= 2 || (next.confounders.includes("alcohol") && next.confounders.length >= 1 && incoming.length >= 2)) {
    return {
      ...next,
      status: "CONFOUNDED",
      protocolAdherence: adherence,
    };
  }
  if (incoming.length >= 2) {
    return { ...next, status: "CONFOUNDED", protocolAdherence: adherence };
  }
  return { ...next, protocolAdherence: adherence };
}
