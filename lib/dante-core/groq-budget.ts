/**
 * Groq free-tier TPM budgets treat a request as roughly
 * (input tokens + max_completion_tokens). openai/gpt-oss-120b was
 * reliably failing at ~8069 reserved tokens against an 8000 TPM
 * ceiling when max_completion_tokens was left at 4096 on large Dante
 * prompts. Keep model fallback to 20b, but size the completion budget
 * so the primary model does not predictably trip TPM.
 */

/** Soft ceiling under Groq's common 8000 TPM limit. */
export const GROQ_TPM_SOFT_CEILING = 7200;

/** Rough OpenAI-style estimate — good enough for budget clamping. */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function groqMaxCompletionTokens(options: {
  model: string;
  inputText: string;
  /** Absolute preferred cap before TPM + model clamping. */
  preferredCap?: number;
}): number {
  const { model, inputText } = options;
  // 120b is the expensive primary — keep its completion reservation tight
  // so large Dante prompts do not trip Groq's ~8000 TPM ceiling.
  const modelHardCap = model.includes("120b")
    ? 1536
    : model.startsWith("openai/gpt-oss")
      ? 2048
      : 2048;
  const preferredCap = Math.min(options.preferredCap ?? modelHardCap, modelHardCap);

  const inputTokens = estimateTokenCount(inputText);
  const room = GROQ_TPM_SOFT_CEILING - inputTokens;

  return Math.max(256, Math.min(preferredCap, room));
}
