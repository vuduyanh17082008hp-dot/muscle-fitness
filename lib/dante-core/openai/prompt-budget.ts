/**
 * Provider-agnostic prompt budgeting for Dante chat + agent turns.
 *
 * Keeps assembled prompts within a predictable input budget so
 * completion tokens remain usable and latency stays bounded — even
 * though OpenAI models allow much larger contexts than the old Groq
 * free-tier ceiling.
 */

/** Soft input budget for a single Dante chat turn. */
export const DANTE_MAX_INPUT_TOKENS = 12_000;

/** Reserve room for a useful completion on every request. */
export const DANTE_COMPLETION_RESERVE = 2_048;

export const DANTE_MAX_COMPLETION_TOKENS = 2_048;

/** Rough token estimate — good enough for budget clamping. */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function maxCompletionTokens(options: {
  inputText: string;
  preferredCap?: number;
  inputBudget?: number;
}): number {
  const preferredCap = options.preferredCap ?? DANTE_MAX_COMPLETION_TOKENS;
  const inputBudget = options.inputBudget ?? DANTE_MAX_INPUT_TOKENS;
  const inputTokens = estimateTokenCount(options.inputText);
  const room = inputBudget + DANTE_COMPLETION_RESERVE - inputTokens;

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
  maxInputTokens: number = DANTE_MAX_INPUT_TOKENS,
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
