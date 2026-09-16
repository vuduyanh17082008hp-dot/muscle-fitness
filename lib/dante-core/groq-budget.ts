/**
 * Groq free-tier TPM budgets treat a request as roughly
 * (input tokens + max_completion_tokens). openai/gpt-oss-120b was
 * reliably failing at ~8069 reserved tokens against an 8000 TPM
 * ceiling when max_completion_tokens was left at 4096 on large Dante
 * prompts — and the live DANTE_INSTRUCTIONS block alone is ~11k
 * estimated tokens, so completion clamping alone is not enough.
 */

/** Soft ceiling under Groq's common 8000 TPM limit. */
export const GROQ_TPM_SOFT_CEILING = 7200;

/** Leave room for a usable completion reservation on every request. */
export const GROQ_COMPLETION_RESERVE = 768;

export const GROQ_MAX_INPUT_TOKENS = GROQ_TPM_SOFT_CEILING - GROQ_COMPLETION_RESERVE;

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

/**
 * Keep the head (identity/priority/safety) and tail (citation/language
 * rules) of a long instruction block when it exceeds the budget.
 */
export function fitTextToTokenBudget(text: string, maxTokens: number): string {
  if (estimateTokenCount(text) <= maxTokens) return text;

  const maxChars = Math.max(256, maxTokens * 4);
  if (text.length <= maxChars) return text;

  const marker = "\n\n[...condensed for model context budget...]\n\n";
  const available = maxChars - marker.length;
  const head = Math.floor(available * 0.7);
  const tail = available - head;
  return `${text.slice(0, head)}${marker}${text.slice(-tail)}`;
}

export function fitJsonToTokenBudget(value: unknown, maxTokens: number): string {
  const pretty = JSON.stringify(value, null, 2);
  if (estimateTokenCount(pretty) <= maxTokens) return pretty;

  const compact = JSON.stringify(value);
  if (estimateTokenCount(compact) <= maxTokens) return compact;

  return fitTextToTokenBudget(compact, maxTokens);
}

/**
 * Final guard: if a fully assembled prompt is still over budget,
 * truncate from the end of the largest middle sections while keeping
 * the CLIENT QUESTION / FINAL INSTRUCTION footer intact when present.
 */
export function fitAssembledPromptToBudget(
  prompt: string,
  maxInputTokens: number = GROQ_MAX_INPUT_TOKENS,
): string {
  if (estimateTokenCount(prompt) <= maxInputTokens) return prompt;

  const questionMarker = "============================================================\nCLIENT QUESTION";
  const questionIndex = prompt.lastIndexOf(questionMarker);

  if (questionIndex > 0) {
    const head = prompt.slice(0, questionIndex);
    const tail = prompt.slice(questionIndex);
    const tailTokens = estimateTokenCount(tail);
    const headBudget = Math.max(512, maxInputTokens - tailTokens);
    return `${fitTextToTokenBudget(head, headBudget)}${tail}`;
  }

  return fitTextToTokenBudget(prompt, maxInputTokens);
}
