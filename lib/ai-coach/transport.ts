import type OpenAI from "openai";
import {
  getAiClient,
  getAiModel,
  usesResponsesApi,
} from "@/lib/ai-coach/provider";
import {
  buildChatMessages,
  buildModelInput,
  COACH_CHAT_TOOLS,
  COACH_TOOLS,
  type CoachAttachment,
  usageFromResponse,
} from "@/lib/ai-coach/server";

export type CoachFunctionCall = {
  type: "function_call";
  name: string;
  arguments: string;
  call_id: string;
};

export type HistoryMessage = {
  id: string;
  role: string;
  content: string;
};

export type PlanningResult = {
  toolCalls: CoachFunctionCall[];
  planningUsage: ReturnType<typeof usageFromResponse>;
  responsesPlanningOutput: any[];
  chatPlanningMessages: OpenAI.Chat.ChatCompletionMessageParam[] | null;
  chatAssistantToolMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam | null;
};

export type StreamDeltaEvent =
  | { type: "delta"; text: string }
  | {
      type: "completed";
      responseId: string | null;
      usage: ReturnType<typeof usageFromResponse>;
    };

export async function planCoachToolCalls(args: {
  instructions: string;
  messages: HistoryMessage[];
  summary?: string | null;
  attachment?: CoachAttachment | null;
  currentMessageId: string;
}): Promise<PlanningResult> {
  const client = getAiClient();
  const model = getAiModel();

  if (usesResponsesApi()) {
    const planningInput = buildModelInput({
      messages: args.messages,
      summary: args.summary,
      attachment: args.attachment,
      currentMessageId: args.currentMessageId,
    });

    const planningResponse: any = await client.responses.create({
      model,
      store: false,
      instructions: args.instructions,
      input: planningInput as any,
      tools: COACH_TOOLS as any,
      tool_choice: "required",
      parallel_tool_calls: true,
      max_output_tokens: 500,
    });

    const planningOutput: any[] = Array.isArray(planningResponse.output)
      ? planningResponse.output
      : [];

    const toolCalls = planningOutput.filter(
      (item: unknown): item is CoachFunctionCall => {
        if (!item || typeof item !== "object") {
          return false;
        }

        const candidate = item as Record<string, unknown>;

        return (
          candidate.type === "function_call" &&
          typeof candidate.name === "string" &&
          typeof candidate.arguments === "string" &&
          typeof candidate.call_id === "string"
        );
      },
    );

    return {
      toolCalls,
      planningUsage: usageFromResponse(planningResponse),
      responsesPlanningOutput: planningOutput,
      chatPlanningMessages: null,
      chatAssistantToolMessage: null,
    };
  }

  const chatPlanningMessages = buildChatMessages({
    instructions: args.instructions,
    messages: args.messages,
    summary: args.summary,
    attachment: args.attachment,
    currentMessageId: args.currentMessageId,
  });

  const planningResponse = await client.chat.completions.create({
    model,
    messages: chatPlanningMessages,
    tools: COACH_CHAT_TOOLS as any,
    tool_choice: "required",
    parallel_tool_calls: true,
    max_tokens: 500,
  });

  const assistantMessage = planningResponse.choices?.[0]?.message;
  const rawToolCalls = assistantMessage?.tool_calls ?? [];

  const chatAssistantToolMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam =
    {
      role: "assistant",
      content: assistantMessage?.content ?? null,
      tool_calls: rawToolCalls,
    };

  const toolCalls: CoachFunctionCall[] = rawToolCalls
    .filter(
      (call) =>
        typeof call.id === "string" &&
        typeof call.function?.name === "string" &&
        typeof call.function?.arguments === "string",
    )
    .map((call) => ({
      type: "function_call" as const,
      name: call.function.name,
      arguments: call.function.arguments,
      call_id: call.id,
    }));

  return {
    toolCalls,
    planningUsage: usageFromResponse(planningResponse),
    responsesPlanningOutput: [],
    chatPlanningMessages,
    chatAssistantToolMessage,
  };
}

export async function* streamCoachFinalAnswer(args: {
  baseInstructions: string;
  messages: HistoryMessage[];
  summary?: string | null;
  attachment?: CoachAttachment | null;
  currentMessageId: string;
  planning: PlanningResult;
  executedTools: Array<{
    callId: string;
    result: unknown;
  }>;
}): AsyncGenerator<StreamDeltaEvent> {
  const client = getAiClient();
  const model = getAiModel();

  if (usesResponsesApi()) {
    const finalInput = [
      ...buildModelInput({
        messages: args.messages,
        summary: args.summary,
        attachment: args.attachment,
        currentMessageId: args.currentMessageId,
      }),
      ...args.planning.responsesPlanningOutput,
      ...args.executedTools.map((tool) => ({
        type: "function_call_output" as const,
        call_id: tool.callId,
        output: JSON.stringify(tool.result),
      })),
    ];

    const responseStream = await client.responses.create({
      model,
      store: false,
      instructions: args.baseInstructions,
      input: finalInput as any,
      stream: true as const,
      max_output_tokens: 1600,
    });

    let finalResponse: any = null;

    for await (const rawEvent of responseStream) {
      const event = rawEvent as any;

      if (event.type === "response.output_text.delta") {
        const delta = typeof event.delta === "string" ? event.delta : "";

        if (delta) {
          yield { type: "delta", text: delta };
        }
      }

      if (event.type === "response.completed") {
        finalResponse = event.response ?? null;
      }

      if (event.type === "response.failed") {
        throw new Error(
          event.response?.error?.message ?? "AI response failed.",
        );
      }

      if (event.type === "error") {
        throw new Error(
          event.error?.message ?? event.message ?? "AI streaming failed.",
        );
      }
    }

    yield {
      type: "completed",
      responseId: finalResponse?.id ?? null,
      usage: usageFromResponse(finalResponse),
    };

    return;
  }

  if (
    !args.planning.chatPlanningMessages ||
    !args.planning.chatAssistantToolMessage
  ) {
    throw new Error("Chat planning context is missing.");
  }

  const chatFinalMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...args.planning.chatPlanningMessages,
    args.planning.chatAssistantToolMessage,
    ...args.executedTools.map(
      (tool): OpenAI.Chat.ChatCompletionToolMessageParam => ({
        role: "tool",
        tool_call_id: tool.callId,
        content: JSON.stringify(tool.result),
      }),
    ),
    {
      role: "system",
      content: `
${args.baseInstructions}

FINAL ANSWER TURN
- Use the tool results above.
- Produce the final natural-language answer for the client now.
- Do not call more tools.
`.trim(),
    },
  ];

  const responseStream = await client.chat.completions.create({
    model,
    messages: chatFinalMessages,
    stream: true as const,
    stream_options: { include_usage: true },
    max_tokens: 1600,
  });

  let responseId: string | null = null;
  let usagePayload: any = null;

  for await (const chunk of responseStream) {
    if (chunk.id) {
      responseId = chunk.id;
    }

    const delta = chunk.choices?.[0]?.delta?.content;

    if (typeof delta === "string" && delta) {
      yield { type: "delta", text: delta };
    }

    if (chunk.usage) {
      usagePayload = { id: chunk.id, usage: chunk.usage };
    }
  }

  yield {
    type: "completed",
    responseId,
    usage: usageFromResponse(
      usagePayload ?? (responseId ? { id: responseId } : null),
    ),
  };
}

export async function completeCoachText(args: {
  instructions: string;
  input: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const client = getAiClient();
  const model = args.model || getAiModel();
  const maxTokens = args.maxTokens ?? 800;

  if (usesResponsesApi()) {
    const response = await client.responses.create({
      model,
      store: false,
      instructions: args.instructions,
      input: args.input,
      max_output_tokens: maxTokens,
    });

    return response.output_text.trim();
  }

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: args.instructions,
      },
      {
        role: "user",
        content: args.input,
      },
    ],
    max_tokens: maxTokens,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}
