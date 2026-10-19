/**
 * Phase 2.5a — the real Core-Conflict classifier, backed by the existing provider abstraction (`callDanteLlm`).
 * Wired by the route only; the coherence pipeline itself stays transport-free and takes any classifier function.
 * `callDanteLlm` never throws and returns null when the provider is unconfigured/failing — that is "uncertain".
 */

import { callDanteLlm } from "@/lib/dante-core/llm-client";
import { buildCoreConflictPrompt, type CoreConflictClassifier } from "@/lib/dante-core/coherence/core-conflict";
import { boundedDependency, type TurnBudget } from "@/lib/dante-core/turn-budget";

/** The classifier's own wait cap: callDanteLlm's existing 20s request timeout. The turn deadline still wins. */
export const CORE_CONFLICT_WAIT_MS = 20_000;

export const llmCoreConflictClassifier: CoreConflictClassifier = async (message) => {
  const result = await callDanteLlm(buildCoreConflictPrompt(message));
  return result?.reply ?? null;
};

/**
 * H0 WP1: the same classifier inside the turn budget. The call reserves one PROVIDER attempt (it is transport, never a
 * semantic repair), does not start without one, and is bounded by the turn signal. Anything but a reply throws, which
 * classifyCoreConflict turns into UNCERTAIN/classifier_error, so a timeout or transport failure is never a decision.
 */
export function budgetedCoreConflictClassifier(budget: TurnBudget): CoreConflictClassifier {
  return async (message) => {
    if (!budget.tryStart("provider")) {
      budget.dependencies.classifier = budget.clientGone() ? "CANCELLED" : "SKIPPED";
      throw new Error("core-conflict classifier: no provider attempt left in the turn budget");
    }
    const outcome = await boundedDependency(
      budget,
      "classifier",
      async (signal) => (await callDanteLlm(buildCoreConflictPrompt(message), { signal }))?.reply ?? Promise.reject(new Error("no reply")),
      CORE_CONFLICT_WAIT_MS,
    );
    if (outcome.status !== "OK") throw new Error(`core-conflict classifier: ${outcome.status}`);
    return outcome.value;
  };
}
