import {
  buildChatMessages,
  buildCoachInstructions,
  buildModelInput,
  chatRequestSchema,
  COACH_CHAT_TOOLS,
  COACH_TOOLS,
  DEFAULT_COACH_SETTINGS,
  getAiModelName,
  getOpenAI,
  maybeSummarizeThread,
  runToolCall,
  type CoachSettings,
  usageFromResponse,
} from "@/lib/ai-coach/server";
import { usesResponsesApi } from "@/lib/ai-coach/provider";
import { createClient } from "@/lib/supabase/server";
import type OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type UsageRow = {
  allowed: boolean;
  usage_date: string;
  plan_code: string;
  messages_used: number;
  daily_limit: number;
  remaining: number;
};

type FunctionCallItem = {
  type: "function_call";
  name: string;
  arguments: string;
  call_id: string;
};

type HistoryMessage = {
  id: string;
  role: string;
  content: string;
};

function getFirstRpcRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) {
    return (data[0] as T | undefined) ?? null;
  }

  return (data as T | null) ?? null;
}

function createThreadTitle(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "New conversation";
  }

  if (normalized.length <= 64) {
    return normalized;
  }

  return `${normalized.slice(0, 61)}...`;
}

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error
    ? error.message
    : fallback;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const db = supabase as any;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json(
      {
        error:
          "Bạn cần đăng nhập để sử dụng AI Coach.",
      },
      {
        status: 401,
      },
    );
  }

  let usageConsumed = false;

  try {
    const rawBody: unknown = await request.json();

    const parsedBody =
      chatRequestSchema.safeParse(rawBody);

    if (!parsedBody.success) {
      return Response.json(
        {
          error:
            "Nội dung gửi lên không hợp lệ.",
          details: parsedBody.error.flatten(),
        },
        {
          status: 400,
        },
      );
    }

    const {
      message,
      attachment = null,
    } = parsedBody.data;

    let threadId: string | null =
      parsedBody.data.threadId ?? null;

    /*
     * Kiểm tra thread cũ có thuộc user hiện tại không.
     */
    if (threadId) {
      const threadResult = await db
        .from("ai_threads")
        .select("id")
        .eq("id", threadId)
        .eq("user_id", user.id)
        .eq("thread_type", "chat")
        .maybeSingle();

      if (
        threadResult.error ||
        !threadResult.data
      ) {
        return Response.json(
          {
            error:
              "Không tìm thấy cuộc trò chuyện này.",
          },
          {
            status: 404,
          },
        );
      }
    } else {
      /*
       * Tạo thread mới.
       */
      const createThreadResult = await db
        .from("ai_threads")
        .insert({
          user_id: user.id,
          title: createThreadTitle(message),
          thread_type: "chat",
          status: "active",
          last_message_at:
            new Date().toISOString(),
        })
        .select("id")
        .single();

      if (
        createThreadResult.error ||
        !createThreadResult.data?.id
      ) {
        throw new Error(
          createThreadResult.error?.message ??
            "Không thể tạo cuộc trò chuyện.",
        );
      }

      threadId = String(
        createThreadResult.data.id,
      );
    }

    /*
     * Tạo biến string cố định để loại bỏ string | null.
     */
    if (!threadId) {
      throw new Error(
        "Không thể xác định conversation thread.",
      );
    }

    const resolvedThreadId: string = threadId;

    /*
     * Trừ một lượt AI bằng RPC atomic.
     */
    const usageResult = await db.rpc(
      "consume_ai_usage",
      {
        p_thread_id: resolvedThreadId,
      },
    );

    if (usageResult.error) {
      throw new Error(
        usageResult.error.message,
      );
    }

    const usage =
      getFirstRpcRow<UsageRow>(
        usageResult.data,
      );

    if (!usage) {
      throw new Error(
        "Không thể xác định lượt sử dụng AI.",
      );
    }

    if (!usage.allowed) {
      return Response.json(
        {
          error:
            "Bạn đã sử dụng hết lượt AI hôm nay.",
          usage,
        },
        {
          status: 429,
        },
      );
    }

    usageConsumed = true;

    /*
     * Không lưu Base64 của file vào database.
     * Chỉ lưu metadata.
     */
    const attachmentMetadata = attachment
      ? [
          {
            kind: attachment.kind,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.size,
          },
        ]
      : [];

    /*
     * Lưu tin nhắn của user.
     */
    const userMessageResult = await db
      .from("ai_messages")
      .insert({
        thread_id: resolvedThreadId,
        user_id: user.id,
        role: "user",
        content: message,
        attachments: attachmentMetadata,
      })
      .select("id")
      .single();

    if (
      userMessageResult.error ||
      !userMessageResult.data?.id
    ) {
      throw new Error(
        userMessageResult.error?.message ??
          "Không thể lưu tin nhắn.",
      );
    }

    const currentMessageId = String(
      userMessageResult.data.id,
    );

    await db
      .from("ai_threads")
      .update({
        last_message_at:
          new Date().toISOString(),
      })
      .eq("id", resolvedThreadId)
      .eq("user_id", user.id);

    /*
     * Lấy settings, summary và lịch sử cùng lúc.
     */
    const [
      settingsResult,
      summaryResult,
      messagesResult,
    ] = await Promise.all([
      db
        .from("ai_user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),

      db
        .from("ai_thread_summaries")
        .select("summary")
        .eq("thread_id", resolvedThreadId)
        .eq("user_id", user.id)
        .maybeSingle(),

      db
        .from("ai_messages")
        .select(
          "id, role, content, created_at",
        )
        .eq("thread_id", resolvedThreadId)
        .eq("user_id", user.id)
        .in("role", ["user", "assistant"])
        .order("created_at", {
          ascending: false,
        })
        .limit(24),
    ]);

    if (messagesResult.error) {
      throw new Error(
        messagesResult.error.message,
      );
    }

    const settings: CoachSettings = {
      ...DEFAULT_COACH_SETTINGS,
      ...(settingsResult.data ?? {}),
    };

    const historyMessages: HistoryMessage[] = [
      ...(messagesResult.data ?? []),
    ]
      .reverse()
      .map(
        (item: {
          id: string;
          role: string;
          content: string;
        }) => ({
          id: String(item.id),
          role: String(item.role),
          content: String(item.content ?? ""),
        }),
      );

    const memorySummary =
      settings.allow_conversation_memory
        ? summaryResult.data?.summary ?? null
        : null;

    const openai = getOpenAI();
    const model = getAiModelName();
    const baseInstructions = buildCoachInstructions(settings);
    const planningInstructions = `
${baseInstructions}

DATA COLLECTION TURN

- This is a private data-collection turn.
- Do not produce the final natural-language answer yet.
- Call every tool required to answer the latest user message.
- Always call get_client_profile.
- Call get_today_workout for questions about today's training.
- Call get_recent_progress for progress, adherence, recovery or weekly summaries.
- Call get_nutrition_summary for calories, macros, protein or meal questions.
- Call write tools only when the client requests the corresponding action.
- Collect all required data in this turn when possible.
`.trim();

    type ExecutedTool = Awaited<ReturnType<typeof runToolCall>>;

    let toolCalls: FunctionCallItem[] = [];
    let planningResponse: any = null;
    let planningOutput: any[] = [];
    let chatPlanningMessages:
      | OpenAI.Chat.ChatCompletionMessageParam[]
      | null = null;
    let chatAssistantToolMessage:
      | OpenAI.Chat.ChatCompletionAssistantMessageParam
      | null = null;

    if (usesResponsesApi()) {
      const planningInput = buildModelInput({
        messages: historyMessages,
        summary: memorySummary,
        attachment,
        currentMessageId,
      });

      planningResponse = await openai.responses.create({
        model,
        store: false,
        instructions: planningInstructions,
        input: planningInput as any,
        tools: COACH_TOOLS as any,
        tool_choice: "required",
        parallel_tool_calls: true,
        max_output_tokens: 500,
      });

      planningOutput = Array.isArray(planningResponse.output)
        ? planningResponse.output
        : [];

      toolCalls = planningOutput.filter(
        (item: unknown): item is FunctionCallItem => {
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
    } else {
      chatPlanningMessages = buildChatMessages({
        instructions: planningInstructions,
        messages: historyMessages,
        summary: memorySummary,
        attachment,
        currentMessageId,
      });

      planningResponse = await openai.chat.completions.create({
        model,
        messages: chatPlanningMessages,
        tools: COACH_CHAT_TOOLS as any,
        tool_choice: "required",
        parallel_tool_calls: true,
        max_tokens: 500,
      });

      const assistantMessage = planningResponse.choices?.[0]?.message;
      const rawToolCalls = assistantMessage?.tool_calls ?? [];

      chatAssistantToolMessage = {
        role: "assistant",
        content: assistantMessage?.content ?? null,
        tool_calls: rawToolCalls,
      };

      toolCalls = rawToolCalls
        .filter(
          (call: {
            id?: string;
            function?: { name?: string; arguments?: string };
          }) =>
            typeof call.id === "string" &&
            typeof call.function?.name === "string" &&
            typeof call.function?.arguments === "string",
        )
        .map(
          (call: {
            id: string;
            function: { name: string; arguments: string };
          }) => ({
            type: "function_call" as const,
            name: call.function.name,
            arguments: call.function.arguments,
            call_id: call.id,
          }),
        );
    }

    if (toolCalls.length === 0) {
      throw new Error(
        "AI không yêu cầu được dữ liệu khách hàng cần thiết.",
      );
    }

    const executedTools: ExecutedTool[] = await Promise.all(
      toolCalls.map((call) =>
        runToolCall({
          db,
          userId: user.id,
          threadId: resolvedThreadId,
          latestUserMessage: message,
          settings,
          call: {
            name: call.name,
            arguments: call.arguments,
            call_id: call.call_id,
          },
        }),
      ),
    );

    const responsesFinalInput = usesResponsesApi()
      ? [
          ...buildModelInput({
            messages: historyMessages,
            summary: memorySummary,
            attachment,
            currentMessageId,
          }),
          ...planningOutput,
          ...executedTools.map((tool) => ({
            type: "function_call_output" as const,
            call_id: tool.callId,
            output: JSON.stringify(tool.result),
          })),
        ]
      : null;

    const chatFinalMessages: OpenAI.Chat.ChatCompletionMessageParam[] | null =
      !usesResponsesApi() &&
      chatPlanningMessages &&
      chatAssistantToolMessage
        ? [
            ...chatPlanningMessages,
            chatAssistantToolMessage,
            ...executedTools.map(
              (tool): OpenAI.Chat.ChatCompletionToolMessageParam => ({
                role: "tool",
                tool_call_id: tool.callId,
                content: JSON.stringify(tool.result),
              }),
            ),
            {
              role: "system",
              content: `
${baseInstructions}

FINAL ANSWER TURN
- Use the tool results above.
- Produce the final natural-language answer for the client now.
- Do not call more tools.
`.trim(),
            },
          ]
        : null;

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        function sendEvent(eventName: string, data: unknown) {
          const payload =
            `event: ${eventName}\n` +
            `data: ${JSON.stringify(data)}\n\n`;

          controller.enqueue(encoder.encode(payload));
        }

        let assistantText = "";
        let finalResponse: any = null;
        let streamClosed = false;

        function closeStream() {
          if (streamClosed) {
            return;
          }

          streamClosed = true;
          controller.close();
        }

        sendEvent("meta", {
          threadId: resolvedThreadId,
          usage,
        });

        for (const tool of executedTools) {
          sendEvent("tool", {
            name: tool.name,
            status:
              tool.result.requires_confirmation === true
                ? "confirmation_required"
                : tool.result.error
                  ? "error"
                  : "completed",
          });
        }

        try {
          if (usesResponsesApi()) {
            const responseStream = await openai.responses.create({
              model,
              store: false,
              instructions: baseInstructions,
              input: responsesFinalInput as any,
              stream: true as const,
              max_output_tokens: 1600,
            });

            for await (const rawEvent of responseStream) {
              const event = rawEvent as any;

              if (event.type === "response.output_text.delta") {
                const delta =
                  typeof event.delta === "string" ? event.delta : "";

                if (!delta) {
                  continue;
                }

                assistantText += delta;
                sendEvent("delta", { text: delta });
              }

              if (event.type === "response.completed") {
                finalResponse = event.response ?? null;
              }

              if (event.type === "response.failed") {
                throw new Error(
                  event.response?.error?.message ??
                    "OpenAI response failed.",
                );
              }

              if (event.type === "error") {
                throw new Error(
                  event.error?.message ??
                    event.message ??
                    "OpenAI streaming failed.",
                );
              }
            }
          } else {
            const responseStream = await openai.chat.completions.create({
              model,
              messages: chatFinalMessages as OpenAI.Chat.ChatCompletionMessageParam[],
              stream: true as const,
              stream_options: { include_usage: true },
              max_tokens: 1600,
            });

            for await (const chunk of responseStream) {
              const delta = chunk.choices?.[0]?.delta?.content;

              if (typeof delta === "string" && delta) {
                assistantText += delta;
                sendEvent("delta", { text: delta });
              }

              if (chunk.usage) {
                finalResponse = {
                  id: chunk.id,
                  usage: chunk.usage,
                };
              } else if (!finalResponse) {
                finalResponse = { id: chunk.id };
              }
            }
          }

          const cleanAssistantText =
            assistantText.trim() ||
            "Mình chưa thể tạo câu trả lời lúc này.";

          const planningUsage = usageFromResponse(planningResponse);
          const finalUsage = usageFromResponse(finalResponse);

          const totalInputTokens =
            planningUsage.inputTokens + finalUsage.inputTokens;
          const totalOutputTokens =
            planningUsage.outputTokens + finalUsage.outputTokens;
          const totalTokens =
            planningUsage.totalTokens + finalUsage.totalTokens;

          const assistantMessageResult = await db
            .from("ai_messages")
            .insert({
              thread_id: resolvedThreadId,
              user_id: user.id,
              role: "assistant",
              content: cleanAssistantText,
              tool_calls: executedTools.map((tool) => ({
                name: tool.name,
                arguments: tool.arguments,
                result: tool.result,
              })),
              openai_response_id: finalResponse?.id ?? null,
              model,
              input_tokens: totalInputTokens,
              output_tokens: totalOutputTokens,
              total_tokens: totalTokens,
            })
            .select("id")
            .single();

          if (
            assistantMessageResult.error ||
            !assistantMessageResult.data?.id
          ) {
            throw new Error(
              assistantMessageResult.error?.message ??
                "Không thể lưu câu trả lời AI.",
            );
          }

          const assistantMessageId = String(
            assistantMessageResult.data.id,
          );

          const [threadUpdateResult, tokenUsageResult] =
            await Promise.all([
              db
                .from("ai_threads")
                .update({
                  last_message_at: new Date().toISOString(),
                })
                .eq("id", resolvedThreadId)
                .eq("user_id", user.id),
              db.rpc("record_ai_token_usage", {
                p_input_tokens: totalInputTokens,
                p_output_tokens: totalOutputTokens,
                p_model: model,
              }),
            ]);

          if (threadUpdateResult.error) {
            console.error(
              "Unable to update AI thread:",
              threadUpdateResult.error,
            );
          }

          if (tokenUsageResult.error) {
            console.error(
              "Unable to record token usage:",
              tokenUsageResult.error,
            );
          }

          try {
            await maybeSummarizeThread({
              db,
              userId: user.id,
              threadId: resolvedThreadId,
            });
          } catch (summaryError) {
            console.error(
              "AI thread summarization failed:",
              summaryError,
            );
          }

          sendEvent("done", {
            threadId: resolvedThreadId,
            messageId: assistantMessageId,
            usage: {
              ...usage,
              remaining: Math.max(usage.remaining, 0),
            },
          });

          closeStream();
        } catch (streamError) {
          console.error("AI stream failed:", streamError);

          if (usageConsumed) {
            try {
              const refundResult = await db.rpc("refund_ai_usage");

              if (refundResult.error) {
                console.error(
                  "Unable to refund AI usage:",
                  refundResult.error,
                );
              } else {
                usageConsumed = false;
              }
            } catch (refundError) {
              console.error(
                "Unable to refund AI usage:",
                refundError,
              );
            }
          }

          sendEvent("error", {
            message: getErrorMessage(
              streamError,
              "AI Coach gặp lỗi khi tạo câu trả lời. Lượt sử dụng đã được hoàn lại.",
            ),
          });

          closeStream();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error(
      "AI Coach route failed:",
      error,
    );

    if (usageConsumed) {
      try {
        const refundResult = await db.rpc(
          "refund_ai_usage",
        );

        if (refundResult.error) {
          console.error(
            "Unable to refund AI usage:",
            refundResult.error,
          );
        }
      } catch (refundError) {
        console.error(
          "Unable to refund AI usage:",
          refundError,
        );
      }
    }

    return Response.json(
      {
        error: getErrorMessage(
          error,
          "AI Coach gặp lỗi không xác định.",
        ),
      },
      {
        status: 500,
      },
    );
  }
}