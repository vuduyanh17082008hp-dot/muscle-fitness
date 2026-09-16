/**
 * @deprecated Import from @/lib/dante-core/openai/prompt-budget instead.
 * Shims remain so older imports keep working during the OpenAI migration.
 */

export {
  DANTE_MAX_INPUT_TOKENS as GROQ_MAX_INPUT_TOKENS,
  DANTE_COMPLETION_RESERVE as GROQ_COMPLETION_RESERVE,
  DANTE_MAX_INPUT_TOKENS as GROQ_TPM_SOFT_CEILING,
  estimateTokenCount,
  fitAssembledPromptToBudget,
  fitJsonToTokenBudget,
  fitTextToTokenBudget,
  maxCompletionTokens as groqMaxCompletionTokens,
} from "@/lib/dante-core/openai/prompt-budget";
