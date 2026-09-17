import type { VerifierFinding, VerifierInput } from "@/lib/dante-core/verifier/types";

const EVIDENCE_LANGUAGE =
  /\b(?:research|studies|evidence|science)\s+(?:shows?|suggests?|indicates?|says?)\b|\baccording to (?:research|studies|a study)\b/i;

/**
 * Narrowly scoped to communication/scheduling verbs Dante has no
 * registered tool for at all (email, phone, text/SMS, an external
 * meeting) — never matches ordinary in-app language like "I've
 * updated your plan" or "I've scheduled your workout", which use
 * different verbs/objects entirely. Tolerates up to two filler words
 * between subject and verb ("I've already emailed...", "I'll just
 * call...").
 */
const FILLER = "(?:\\s+\\S+){0,2}";
const EXTERNAL_ACTION_CLAIM = new RegExp(
  `\\bi(?:'ve| have)?${FILLER}\\s+(?:sent|emailed|called|texted|messaged)\\b` +
    `|\\bi(?:'ll| will)${FILLER}\\s+(?:send|email|call|text|message)\\b` +
    `|\\bi(?:'ve| have)?${FILLER}\\s+(?:scheduled|booked)\\b[^.!?]{0,25}\\b(?:call|meeting|appointment|email)\\b`,
  "i",
);

/**
 * Specific-metric assertion patterns the reply is only allowed to make
 * when a matching known fact was actually supplied this turn. Each
 * pattern names the fact-label substrings ("hints") that would count
 * as traceable support for it — deliberately narrow (only patterns
 * that name a specific athlete metric by value) to avoid flagging
 * ordinary training advice ("aim for 8-12 reps") as invented data.
 */
const ATHLETE_METRIC_ASSERTIONS: Array<{ pattern: RegExp; factLabelHints: string[] }> = [
  { pattern: /\byour recovery(?:\s+score)?\s+(?:is|was)\s+\d+(?:\.\d+)?/i, factLabelHints: ["recovery"] },
  { pattern: /\byour readiness(?:\s+score)?\s+(?:is|was)\s+\d+(?:\.\d+)?/i, factLabelHints: ["readiness"] },
  { pattern: /\byou(?:'ve| have)?\s+slept\s+\d+(?:\.\d+)?\s*(?:hours?|h)\b/i, factLabelHints: ["sleep"] },
  { pattern: /\byour hrv\s+(?:is|was)\s+\d+(?:\.\d+)?/i, factLabelHints: ["hrv"] },
  {
    pattern: /\byou(?:'ve| have)?\s+(?:eaten|consumed|had)\s+\d+(?:\.\d+)?\s*(?:calories|kcal|g protein|grams? of protein)/i,
    factLabelHints: ["calorie", "protein"],
  },
  { pattern: /\byour (?:training )?load\s+(?:is|was)\s+\d+(?:\.\d+)?/i, factLabelHints: ["load"] },
];

function normalizeLabel(label: string): string {
  return label
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
}

/** Invariant 5 support: safety may halt processing at any stage — this is the last checkpoint before release, guarding against a future wiring bug bypassing the safety short-circuit upstream. */
export function checkSafetyAdherence(input: VerifierInput): VerifierFinding[] {
  if (!input.safety?.triggered || !input.safety.responseOverride) return [];

  if (input.replyText.trim() !== input.safety.responseOverride.trim()) {
    return [
      {
        code: "safety_override_violated",
        severity: "blocker",
        message: "Safety was triggered for this turn but the reply text does not match the required escalation response verbatim.",
      },
    ];
  }

  return [];
}

/** Invariant 9 support: a value that IS supplied must not be silently changed by the communication layer. */
export function checkDeterministicValueMutation(input: VerifierInput): VerifierFinding[] {
  const findings: VerifierFinding[] = [];
  const lowerReply = input.replyText.toLowerCase();

  for (const fact of input.knownFacts) {
    const normalized = normalizeLabel(fact.label);
    const labelIndex = lowerReply.indexOf(normalized);
    if (labelIndex === -1) continue;

    const window = input.replyText.slice(labelIndex, labelIndex + normalized.length + 40);
    const numberMatch = window.match(/-?\d+(?:\.\d+)?/);
    if (!numberMatch) continue;

    const stated = Number.parseFloat(numberMatch[0]);
    const acceptable = [fact.value, Math.round(fact.value), Number(fact.value.toFixed(1))];
    // A fraction (e.g. 0.05) may legitimately be voiced as a percent (5).
    if (fact.value > -1 && fact.value < 1) acceptable.push(Math.round(fact.value * 100));

    const matches = acceptable.some((candidate) => Math.abs(candidate - stated) < 0.05);

    if (!matches) {
      findings.push({
        code: "deterministic_value_mutation",
        severity: "blocker",
        message: `Reply states "${fact.label}" as ${stated}, but the traceable value is ${fact.value}.`,
      });
    }
  }

  return findings;
}

/** Non-negotiable-rule support: the LLM may never invent an athlete metric that was never supplied. */
export function checkInventedAthleteMetric(input: VerifierInput): VerifierFinding[] {
  const findings: VerifierFinding[] = [];

  for (const { pattern, factLabelHints } of ATHLETE_METRIC_ASSERTIONS) {
    const match = input.replyText.match(pattern);
    if (!match) continue;

    const isTraceable = input.knownFacts.some((fact) => {
      const normalized = normalizeLabel(fact.label);
      return factLabelHints.some((hint) => normalized.includes(hint));
    });

    if (!isTraceable) {
      findings.push({
        code: "invented_athlete_metric",
        severity: "blocker",
        message: `Reply asserts a specific athlete metric ("${match[0]}") that was never supplied as a known fact this turn.`,
      });
    }
  }

  return findings;
}

/** The reply must never claim to have performed, or promise to perform, an action Dante has no registered tool for (email, phone call, text) — see lib/dante-core/tools/registry.ts, which has no such tool at all today. `executedActions` (real tool executions this turn, if any) is the only thing that can clear this: if some future tool's trace label loosely matches the claimed verb, it's a real completed action, not an invented one. */
export function checkToolCapabilityClaim(input: VerifierInput): VerifierFinding[] {
  const match = input.replyText.match(EXTERNAL_ACTION_CLAIM);
  if (!match) return [];

  const executedActions = input.executedActions ?? [];
  const claimedVerb = match[0].toLowerCase();
  const clearedByRealExecution = executedActions.some((action) => claimedVerb.includes(action.toLowerCase()) || action.toLowerCase().includes(claimedVerb));

  if (clearedByRealExecution) return [];

  return [
    {
      code: "claimed_tool_capability",
      severity: "blocker",
      message: `Reply claims an external action ("${match[0]}") that Dante has no registered tool for and did not execute this turn.`,
    },
  ];
}

/** Every claim invoking "research/evidence" must have had at least one source actually retrieved this turn. This does not verify the claim matches a specific source's content — only that some source was available (documented limitation, see docs/dante-core.md). */
export function checkCitationMismatch(input: VerifierInput): VerifierFinding[] {
  if (EVIDENCE_LANGUAGE.test(input.replyText) && input.availableSources.length === 0) {
    return [
      {
        code: "citation_mismatch",
        severity: "blocker",
        message: "Reply invokes research/evidence language, but no source was retrieved for this turn.",
      },
    ];
  }

  return [];
}
