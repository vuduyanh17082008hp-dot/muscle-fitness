/**
 * Dante Core LLM client — OpenAI only.
 *
 * Re-exports the unified client used by explain.ts, daily-intelligence.ts,
 * tools/orchestrate.ts, and /api/chatbot.
 */

export {
  callOpenAiWithFallback,
  callOpenAiAgentTurn,
  streamDanteReply,
  callGroqWithFallback,
  callGroqAgentTurn,
  type LlmResult,
  type OpenAiChatMessage,
  type OpenAiToolSpec,
  type OpenAiToolCall,
  type OpenAiAgentTurnResult,
  type GroqChatMessage,
  type GroqToolSpec,
  type GroqToolCall,
  type GroqAgentTurnResult,
  type DanteStreamEvent,
} from "@/lib/dante-core/openai/client";
