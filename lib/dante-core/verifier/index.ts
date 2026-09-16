import {
  checkCitationMismatch,
  checkDeterministicValueMutation,
  checkInventedAthleteMetric,
  checkSafetyAdherence,
  checkToolCapabilityClaim,
} from "@/lib/dante-core/verifier/checks";
import type { VerifierFinding, VerifierInput, VerifierOutcome, VerifierResult } from "@/lib/dante-core/verifier/types";

export type {
  VerifierCheckCode,
  VerifierFact,
  VerifierFinding,
  VerifierInput,
  VerifierOutcome,
  VerifierResult,
  VerifierSafetyState,
  VerifierSeverity,
} from "@/lib/dante-core/verifier/types";
export {
  checkCitationMismatch,
  checkDeterministicValueMutation,
  checkInventedAthleteMetric,
  checkSafetyAdherence,
  checkToolCapabilityClaim,
} from "@/lib/dante-core/verifier/checks";

/**
 * spec: "MAX_RETRIES = 2" for Layer 6 — this is 2 REGENERATION attempts
 * after the first try (3 total calls to `generate` in
 * runVerifiedGeneration below), matching "on failure, return a
 * structured correction brief ... if transformation fails repeatedly,
 * fall back to deterministic structured output."
 */
export const MAX_VERIFIER_RETRIES = 2;

/**
 * Maps a blocker code to a recovery category (Dante P1 partial-failure
 * fix). Only "unsafe_component" from an actual safety-override
 * violation can never be relaxed by a regeneration — everything else
 * is recoverable via a decomposed, partial-answer retry (see
 * buildCorrectionBrief) rather than an all-or-nothing collapse.
 */
function outcomeForFindings(findings: VerifierFinding[]): VerifierOutcome {
  const blockers = findings.filter((finding) => finding.severity === "blocker");
  if (blockers.length === 0) return "verified";

  if (blockers.some((finding) => finding.code === "safety_override_violated")) return "unsafe_component";
  if (blockers.some((finding) => finding.code === "claimed_tool_capability")) return "tool_unavailable";
  if (
    blockers.some(
      (finding) => finding.code === "invented_athlete_metric" || finding.code === "deterministic_value_mutation" || finding.code === "citation_mismatch",
    )
  ) {
    return "insufficient_evidence";
  }

  return "failed";
}

export function verifyFinalResponse(input: VerifierInput): VerifierResult {
  const findings: VerifierFinding[] = [
    ...checkSafetyAdherence(input),
    ...checkDeterministicValueMutation(input),
    ...checkInventedAthleteMetric(input),
    ...checkCitationMismatch(input),
    ...checkToolCapabilityClaim(input),
  ];

  const outcome = outcomeForFindings(findings);
  const passed = outcome === "verified";

  return {
    passed,
    outcome,
    findings,
    correctionBrief: passed ? null : buildCorrectionBrief(findings, outcome),
  };
}

/**
 * Partial-failure recovery (Dante P1 fix): a blocker in one part of a
 * complex, multi-part request must never be treated as "cannot answer
 * anything". This brief actively teaches the model to decompose —
 * answer everything safe/grounded in full, and explicitly decline
 * (not silently drop, not invent around) only the flagged parts —
 * except for an actual safety-override violation, where the ONLY
 * correct fix is using the required escalation text verbatim.
 */
export function buildCorrectionBrief(findings: VerifierFinding[], outcome: VerifierOutcome = outcomeForFindings(findings)): string {
  const blockers = findings.filter((finding) => finding.severity === "blocker");
  const lines = blockers.map((finding) => `- [${finding.code}] ${finding.message}`);

  if (outcome === "unsafe_component" && blockers.some((finding) => finding.code === "safety_override_violated")) {
    return "The previous reply did not use the required safety escalation response for this message. Replace the ENTIRE reply with the exact required safety response text — do not add to it, soften it, or explain around it.";
  }

  return [
    "The previous reply failed verification. This does NOT mean refuse the whole request — decompose it instead:",
    "",
    "1. Answer in full every part of the request that is safe and grounded in the data you actually have.",
    "2. For each flagged part below, do not attempt to satisfy it as asked — state plainly, in one sentence, that you can't (unsafe method, not enough data, or no capability for that action). Never invent a number, a memory, or a completed action to get around a flag.",
    "3. If a flagged part reflects a legitimate underlying goal (an unsafe or ungrounded METHOD for a real goal), suggest a safer or better-grounded way to pursue that same goal instead of only refusing.",
    "4. Compose ONE coherent answer in normal coaching prose — do not literally enumerate 'component 1 / component 2'.",
    "",
    "Flagged:",
    ...lines,
    "",
    "Fix ONLY the flagged parts above, using ONLY the facts and sources already provided for everything else — do not invent new ones.",
  ].join("\n");
}

/**
 * ONE outcome-differentiated fallback message, shared by every Dante
 * response path (legacy Q&A retry loop, agent tool loop's single-pass
 * check) — Dante P1: never the same generic "couldn't verify" line
 * regardless of what actually went wrong.
 */
export function buildFallbackMessage(outcome: VerifierOutcome): string {
  switch (outcome) {
    case "unsafe_component":
      return "Part of what you're asking isn't something I can safely help with as described. I don't want to guess at a workaround — ask me about the specific safe part you want help with, or the same goal without the unsafe method, and I can help directly.";
    case "tool_unavailable":
      return "I can't actually send a message, make a call, or take an action outside Muscle Fitness — I can only read and update things inside the app (like your plan, food log, or check-in), and only with your confirmation. Ask me about one of those and I can help directly.";
    case "insufficient_evidence":
      return "I wasn't able to ground every part of that answer in data I actually have, so I don't want to guess. Ask me one specific part at a time and I can answer it directly from what's actually logged.";
    default:
      return "I wasn't able to produce a fully verified answer for this one. Try asking again, maybe more specifically.";
  }
}

export type VerifiedGenerationResult = {
  replyText: string;
  verifier: VerifierResult;
  /** Total calls made to `generate` (1 = passed on the first try). */
  attempts: number;
  usedFallback: boolean;
};

/**
 * Bounded retry orchestration for Layer 6. Generic and side-effect-free
 * — it never calls an LLM itself, the caller supplies `generate`. This
 * is deliberately NOT wired into app/api/chatbot/route.ts's live
 * streaming path: that route streams tokens as they arrive, and
 * verify-then-maybe-retry needs the full text up front, which trades
 * off perceived latency for safety — a product decision, not one to
 * make silently inside this pass. See docs/dante-core.md.
 *
 * `fallback` receives the LAST outcome/findings this loop actually
 * saw — the caller uses this to return an outcome-specific message
 * (Dante P1: never one generic "couldn't verify" line regardless of
 * cause) rather than pretending every failure looks the same.
 */
export async function runVerifiedGeneration(
  generate: (correctionBrief: string | null) => Promise<string>,
  buildInput: (replyText: string) => VerifierInput,
  fallback: (outcome: VerifierOutcome, findings: VerifierFinding[]) => string,
): Promise<VerifiedGenerationResult> {
  let correctionBrief: string | null = null;
  let lastVerifier: VerifierResult | null = null;

  for (let attempt = 1; attempt <= MAX_VERIFIER_RETRIES + 1; attempt += 1) {
    let replyText: string;

    try {
      replyText = await generate(correctionBrief);
    } catch (error) {
      // A provider hiccup on one attempt must not crash the whole
      // pipeline or be indistinguishable from a content problem — it
      // just consumes this attempt and the loop retries (or falls
      // back) exactly as it would for a failed verification.
      const message = error instanceof Error ? error.message : String(error);
      lastVerifier = {
        passed: false,
        outcome: "failed",
        findings: [{ code: "generation_failed", severity: "blocker", message: `Generation attempt failed: ${message}` }],
        correctionBrief: "The previous attempt failed to generate a response. Try again.",
      };
      correctionBrief = lastVerifier.correctionBrief;
      continue;
    }

    const verifier = verifyFinalResponse(buildInput(replyText));
    lastVerifier = verifier;

    if (verifier.passed) {
      return { replyText, verifier, attempts: attempt, usedFallback: false };
    }

    correctionBrief = verifier.correctionBrief;
  }

  const outcome = lastVerifier?.outcome ?? "failed";
  const findings = lastVerifier?.findings ?? [];
  const fallbackText = fallback(outcome, findings);

  return {
    replyText: fallbackText,
    // Actually re-verified, not assumed — if the fallback itself ever
    // fails this, that is a real bug worth surfacing, not hidden.
    verifier: verifyFinalResponse(buildInput(fallbackText)),
    attempts: MAX_VERIFIER_RETRIES + 1,
    usedFallback: true,
  };
}
