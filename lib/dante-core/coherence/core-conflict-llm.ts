/**
 * Phase 2.5a — the real Core-Conflict classifier, backed by the existing provider abstraction (`callDanteLlm`).
 * Wired by the route only; the coherence pipeline itself stays transport-free and takes any classifier function.
 * `callDanteLlm` never throws and returns null when the provider is unconfigured/failing — that is "uncertain".
 */

import { callDanteLlm } from "@/lib/dante-core/llm-client";
import { buildCoreConflictPrompt, type CoreConflictClassifier } from "@/lib/dante-core/coherence/core-conflict";

export const llmCoreConflictClassifier: CoreConflictClassifier = async (message) => {
  const result = await callDanteLlm(buildCoreConflictPrompt(message));
  return result?.reply ?? null;
};
