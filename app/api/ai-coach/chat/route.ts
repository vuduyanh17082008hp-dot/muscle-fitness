import {
  getDevAiErrorDetail,
  logAiCoachFailure,
  toAiClientErrorPayload,
} from "@/lib/ai-coach/errors";
import { getSafeProviderInfo } from "@/lib/ai-coach/provider";
import {
  buildCoachInstructions,
  chatRequestSchema,
  DEFAULT_COACH_SETTINGS,
  getAiModelName,
  maybeSummarizeThread,
  runToolCall,
  type CoachSettings,
} from "@/lib/ai-coach/server";
import {
  planCoachToolCalls,
  streamCoachFinalAnswer,
  type HistoryMessage,
} from "@/lib/ai-coach/transport";
import { createClient } from "@/lib/supabase/server";

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

function getClientErrorPayload(error: unknown) {
  const payload = toAiClientErrorPayload(error);
  const detail = getDevAiErrorDetail(error);

  if (detail && process.env.NODE_ENV === "development") {
    return {
      ...payload,
      message: `${payload.message} (${detail})`,
    };
  }

  return payload;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  // Supabase generated Database types omit AI RPCs on this branch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json(
      {
        error: "Bạn cần đăng nhập để sử dụng AI Coach.",
      },
      {
        status: 401,
      },
    );
  }

  let usageConsumed = false;

  try {
    const rawBody: unknown = await request.json();
    const parsedBody = chatRequestSchema.safeParse(rawBody);

    if (!parsedBody.success) {
      return Response.json(
        {
          error: "Nội dung gửi lên không hợp lệ.",
          details: parsedBody.error.flatten(),
        },
        {
          status: 400,
        },
      );
    }

    const { message, attachment = null } = parsedBody.data;
    let threadId: string | null = parsedBody.data.threadId ?? null;

    if (threadId) {
      const threadResult = await db
        .from("ai_threads")
        .select("id")
        .eq("id", threadId)
        .eq("user_id", user.id)
        .eq("thread_type", "chat")
        .maybeSingle();

      if (threadResult.error || !threadResult.data) {
        return Response.json(
          {
            error: "Không tìm thấy cuộc trò chuyện này.",
          },
          {
            status: 404,
          },
        );
      }
    } else {
      const createThreadResult = await db
        .from("ai_threads")
        .insert({
          user_id: user.id,
          title: createThreadTitle(message),
          thread_type: "chat",
          status: "active",
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (createThreadResult.error || !createThreadResult.data?.id) {
        throw new Error(
          createThreadResult.error?.message ??
            "Không thể tạo cuộc trò chuyện.",
        );
      }

      threadId = String(createThreadResult.data.id);
    }

    if (!threadId) {
      throw new Error("Không thể xác định conversation thread.");
    }

    const resolvedThreadId: string = threadId;

    const usageResult = await db.rpc("consume_ai_usage", {
      p_thread_id: resolvedThreadId,
    });

    if (usageResult.error) {
      throw new Error(usageResult.error.message);
    }

    const usage = getFirstRpcRow<UsageRow>(usageResult.data);

    if (!usage) {
      throw new Error("Không thể xác định lượt sử dụng AI.");
    }

    if (!usage.allowed) {
      return Response.json(
        {
          error: "Bạn đã sử dụng hết lượt AI hôm nay.",
          usage,
        },
        {
          status: 429,
        },
      );
    }

    usageConsumed = true;

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

    if (userMessageResult.error || !userMessageResult.data?.id) {
      throw new Error(
        userMessageResult.error?.message ?? "Không thể lưu tin nhắn.",
      );
    }

    const currentMessageId = String(userMessageResult.data.id);

    await db
      .from("ai_threads")
      .update({
        last_message_at: new Date().toISOString(),
      })
      .eq("id", resolvedThreadId)
      .eq("user_id", user.id);

    const [settingsResult, summaryResult, messagesResult] =
      await Promise.all([
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
          .select("id, role, content, created_at")
          .eq("thread_id", resolvedThreadId)
          .eq("user_id", user.id)
          .in("role", ["user", "assistant"])
          .order("created_at", {
            ascending: false,
          })
          .limit(24),
      ]);

    if (messagesResult.error) {
      throw new Error(messagesResult.error.message);
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
        (item: { id: string; role: string; content: string }) => ({
          id: String(item.id),
          role: String(item.role),
          content: String(item.content ?? ""),
        }),
      );

    const memorySummary = settings.allow_conversation_memory
      ? summaryResult.data?.summary ?? null
      : null;

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

    const planning = await planCoachToolCalls({
      instructions: planningInstructions,
      messages: historyMessages,
      summary: memorySummary,
      attachment,
      currentMessageId,
    });

    if (planning.toolCalls.length === 0) {
      throw new Error(
        "AI không yêu cầu được dữ liệu khách hàng cần thiết.",
      );
    }

    const executedTools = await Promise.all(
      planning.toolCalls.map((call) =>
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
        let finalResponseId: string | null = null;
        let finalUsage = {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        };
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
          for await (const event of streamCoachFinalAnswer({
            baseInstructions,
            messages: historyMessages,
            summary: memorySummary,
            attachment,
            currentMessageId,
            planning,
            executedTools,
          })) {
            if (event.type === "delta") {
              assistantText += event.text;
              sendEvent("delta", { text: event.text });
            }

            if (event.type === "completed") {
              finalResponseId = event.responseId;
              finalUsage = event.usage;
            }
          }

          const cleanAssistantText =
            assistantText.trim() ||
            "Mình chưa thể tạo câu trả lời lúc này.";

          const totalInputTokens =
            planning.planningUsage.inputTokens + finalUsage.inputTokens;
          const totalOutputTokens =
            planning.planningUsage.outputTokens + finalUsage.outputTokens;
          const totalTokens =
            planning.planningUsage.totalTokens + finalUsage.totalTokens;

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
              openai_response_id: finalResponseId,
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
          const info = getSafeProviderInfo();
          logAiCoachFailure("stream failed", streamError, {
            provider: info.provider,
            model: info.model,
          });

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

          const payload = getClientErrorPayload(streamError);
          sendEvent("error", payload);

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
    const info = getSafeProviderInfo();
    logAiCoachFailure("route failed", error, {
      provider: info.provider,
      model: info.model,
    });

    if (usageConsumed) {
      try {
        const refundResult = await db.rpc("refund_ai_usage");

        if (refundResult.error) {
          console.error(
            "Unable to refund AI usage:",
            refundResult.error,
          );
        }
      } catch (refundError) {
        console.error("Unable to refund AI usage:", refundError);
      }
    }

    return Response.json(getClientErrorPayload(error), {
      status: 500,
    });
  }
}
