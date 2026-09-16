import "server-only";

import { DANTE_TOOLS, getDanteTool } from "@/lib/dante-core/tools/registry";
import { zodToJsonSchema } from "@/lib/dante-core/tools/json-schema";
import { createPendingAction } from "@/lib/dante-core/tools/pending-actions";
import { logToolEvent } from "@/lib/dante-core/tools/observability";
import { safeExecuteTool } from "@/lib/dante-core/tools/safe-execute";
import { callDanteAgentTurn, type DanteAgentTurnResult, type DanteChatMessage, type DanteToolCall, type DanteToolSpec } from "@/lib/dante-core/llm-client";
import { formatDanteTemporalContext } from "@/lib/dante-core/temporal-context";
import { decideDanteLanguage, buildDanteLanguageInstruction } from "@/lib/dante-language";
import { buildEpistemicPolicyInstruction } from "@/lib/dante-core/epistemics/policy";
import { buildToolAuthorityInstruction } from "@/lib/dante-core/epistemics/tool-authority";
import type { ToolContext } from "@/lib/dante-core/tools/types";
import type { DanteResponseEnvelope } from "@/lib/dante-core/tools/response-envelope";

/**
 * The agentic tool-call loop (Part 10): UNDERSTAND -> SELECT TOOL ->
 * READ REAL STATE / PROPOSE ACTION -> (CONFIRM) -> REPORT. Extends the
 * existing OpenAI orchestration (lib/dante-core/llm-client.ts) rather
 * than a second model client. A write tool NEVER executes from this
 * loop — it always stops at a pending confirmation (Part 7/16); only
 * lib/dante-core/tools/pending-actions.ts::confirmPendingAction, called
 * from an explicit user CONFIRM, ever runs a write tool's `execute`.
 */
export const MAX_TOOL_ROUNDS = 4;

export type ModelCaller = (messages: DanteChatMessage[], tools: DanteToolSpec[]) => Promise<DanteAgentTurnResult>;

function buildSystemPrompt(context: ToolContext, userMessage: string): string {
  const languageDecision = context.languageDecision ?? decideDanteLanguage({ currentMessage: userMessage });

  return `You are Dante's tool-selection layer inside Muscle Fitness.

Select at most ONE tool per turn from the tools you were given. Use the
fewest tools needed to answer (Part 11) — a structured question about
the user's own current state (workout, macros, recovery, adaptive
recommendation) needs exactly one matching get_* tool and never
retrieve_knowledge; retrieve_knowledge/get_exercise_guidance are only
for reusable reference knowledge (technique, research), never the
user's own live numbers.

For any progression/adaptation question ("should I increase X"),
always call get_adaptive_recommendation and report its action exactly
as returned — never decide progression yourself.

A write tool (log_food, update_food_log, delete_food_log,
complete_checkin, schedule_workout, accept_adaptive_adjustment) always
requires the user's explicit confirmation before anything is saved —
calling it here only proposes it, it does not execute it. Read tools
execute immediately and their result is given back to you.

A direct question about the current time/date ("what time is it?",
"what day is it?", "is my workout today?") needs no tool at all — the
CURRENT TEMPORAL CONTEXT below is already authoritative; never
retrieve_knowledge for it.

${formatDanteTemporalContext(context.temporalContext ?? null)}

Once you have enough information, respond with your final natural-
language answer instead of another tool call.

${buildDanteLanguageInstruction(languageDecision)}

${buildEpistemicPolicyInstruction()}

${buildToolAuthorityInstruction(DANTE_TOOLS)}`;
}

const TRACE_LABEL: Record<string, string> = {
  get_today_plan: "Checked today's plan",
  get_current_workout: "Checked today's workout",
  get_training_state: "Checked training volume",
  get_adaptive_recommendation: "Checked adaptive recommendation",
  get_recovery_state: "Checked recovery/readiness",
  get_nutrition_state: "Checked today's nutrition",
  get_progress_summary: "Checked progress summary",
  search_food: "Searched foods",
  get_exercise_guidance: "Checked exercise guidance",
  retrieve_knowledge: "Checked knowledge base",
};

function assistantToolCallMessage(call: DanteToolCall): DanteChatMessage {
  return {
    role: "assistant",
    content: "",
    tool_calls: [{ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } }],
  };
}

function toolResultMessage(call: DanteToolCall, result: unknown): DanteChatMessage {
  return { role: "tool", tool_call_id: call.id, name: call.name, content: JSON.stringify(result) };
}

function toolSpecs(): DanteToolSpec[] {
  return DANTE_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.inputSchema),
  }));
}

export async function runDanteAgentTurn(
  context: ToolContext,
  userMessage: string,
  options?: { callModel?: ModelCaller },
): Promise<DanteResponseEnvelope> {
  const callModel = options?.callModel ?? callDanteAgentTurn;

  const messages: DanteChatMessage[] = [
    { role: "system", content: buildSystemPrompt(context, userMessage) },
    { role: "user", content: userMessage },
  ];

  const specs = toolSpecs();
  const toolTraceSummary: string[] = [];
  // Loop protection (Part 10/O): the SAME tool name + args in one turn is refused the second time, never silently re-run.
  const seenCalls = new Set<string>();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const decision = await callModel(messages, specs);

    if (decision.type === "final") {
      return { reply: decision.reply, toolTraceSummary };
    }

    const call = decision.toolCalls[0];

    if (!call) {
      return { reply: "I wasn't able to determine what to check — could you rephrase that?", toolTraceSummary };
    }

    const tool = getDanteTool(call.name);

    if (!tool) {
      messages.push(assistantToolCallMessage(call), toolResultMessage(call, { error: `Unknown tool "${call.name}".` }));
      continue;
    }

    const dedupeKey = `${call.name}:${JSON.stringify(call.arguments)}`;

    if (seenCalls.has(dedupeKey)) {
      messages.push(assistantToolCallMessage(call), toolResultMessage(call, { error: "This exact call was already made this turn — use what you already have." }));
      continue;
    }

    seenCalls.add(dedupeKey);

    const parsed = tool.inputSchema.safeParse(call.arguments);

    if (!parsed.success) {
      messages.push(assistantToolCallMessage(call), toolResultMessage(call, { error: "Invalid arguments for this tool." }));
      continue;
    }

    logToolEvent("DANTE_TOOL_SELECTED", { tool: tool.name });

    if (tool.mode === "write") {
      const summary = tool.summarize ? tool.summarize(parsed.data) : `Run ${tool.name}`;
      const pending = await createPendingAction(context.supabase, context.userId, tool.name, parsed.data, summary, context.now);

      return {
        reply: `I'd like to: **${summary}**. Confirm to proceed, or cancel — nothing has been saved yet.`,
        pendingConfirmation: { actionId: pending.actionId, toolName: tool.name, summary: pending.summary },
        toolTraceSummary,
      };
    }

    const result = await safeExecuteTool(tool, context, parsed.data);

    if (!result.ok) {
      logToolEvent("DANTE_TOOL_FAILED", { tool: tool.name });
      messages.push(assistantToolCallMessage(call), toolResultMessage(call, { error: result.error }));
      continue;
    }

    logToolEvent("DANTE_TOOL_SUCCESS", { tool: tool.name });
    toolTraceSummary.push(TRACE_LABEL[tool.name] ?? `Checked ${tool.name}`);
    messages.push(assistantToolCallMessage(call), toolResultMessage(call, result.data));
  }

  return {
    reply: "I checked several things but couldn't finish forming an answer in time — could you ask again, maybe more specifically?",
    toolTraceSummary,
  };
}
