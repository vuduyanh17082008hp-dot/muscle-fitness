"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

export type AiCoachUiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type AiCoachUsage = {
  plan_code: string;
  messages_used: number;
  daily_limit: number;
  remaining: number;
};

type AiCoachClientProps = {
  initialThreadId: string | null;
  initialMessages: AiCoachUiMessage[];
  initialUsage: AiCoachUsage | null;
};

type ServerSentEvent = {
  event: string;
  data: Record<string, unknown>;
};

function parseSseBlock(
  block: string,
): ServerSentEvent | null {
  const lines = block.split("\n");

  const event =
    lines
      .find((line) =>
        line.startsWith("event:"),
      )
      ?.slice("event:".length)
      .trim() ?? "message";

  const dataText = lines
    .filter((line) =>
      line.startsWith("data:"),
    )
    .map((line) =>
      line.slice("data:".length).trim(),
    )
    .join("\n");

  if (!dataText) {
    return null;
  }

  try {
    return {
      event,
      data: JSON.parse(dataText) as Record<
        string,
        unknown
      >,
    };
  } catch {
    return null;
  }
}

function getErrorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "AI Coach gặp lỗi không xác định.";
}

export function AiCoachClient({
  initialThreadId,
  initialMessages,
  initialUsage,
}: AiCoachClientProps) {
  const [threadId, setThreadId] =
    useState<string | null>(initialThreadId);

  const [messages, setMessages] =
    useState<AiCoachUiMessage[]>(
      initialMessages,
    );

  const [usage, setUsage] =
    useState<AiCoachUsage | null>(
      initialUsage,
    );

  const [input, setInput] = useState("");
  const [sending, setSending] =
    useState(false);

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const bottomRef =
    useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, status]);

  function startNewConversation() {
    if (sending) {
      return;
    }

    setThreadId(null);
    setMessages([]);
    setInput("");
    setError("");
    setStatus("");

    window.history.replaceState(
      null,
      "",
      "/ai-coach",
    );
  }

  function updateUsage(
    rawUsage: unknown,
  ) {
    if (
      !rawUsage ||
      typeof rawUsage !== "object"
    ) {
      return;
    }

    const candidate =
      rawUsage as Record<string, unknown>;

    setUsage({
      plan_code:
        typeof candidate.plan_code ===
        "string"
          ? candidate.plan_code
          : "free",

      messages_used:
        typeof candidate.messages_used ===
        "number"
          ? candidate.messages_used
          : 0,

      daily_limit:
        typeof candidate.daily_limit ===
        "number"
          ? candidate.daily_limit
          : 10,

      remaining:
        typeof candidate.remaining ===
        "number"
          ? candidate.remaining
          : 0,
    });
  }

  async function sendMessage(
    event?: FormEvent<HTMLFormElement>,
    suggestedMessage?: string,
  ) {
    event?.preventDefault();

    if (sending) {
      return;
    }

    const messageToSend =
      (suggestedMessage ?? input).trim();

    if (!messageToSend) {
      return;
    }

    const temporaryUserId =
      `user-${Date.now()}`;

    const temporaryAssistantId =
      `assistant-${Date.now()}`;

    const createdAt =
      new Date().toISOString();

    setMessages((current) => [
      ...current,
      {
        id: temporaryUserId,
        role: "user",
        content: messageToSend,
        createdAt,
      },
      {
        id: temporaryAssistantId,
        role: "assistant",
        content: "",
        createdAt,
      },
    ]);

    setInput("");
    setError("");
    setSending(true);
    setStatus(
      "AI Coach đang đọc dữ liệu của bạn...",
    );

    try {
      const response = await fetch(
        "/api/ai-coach/chat",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            threadId,
            message: messageToSend,
            attachment: null,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => null);

        if (errorData?.usage) {
          updateUsage(errorData.usage);
        }

        throw new Error(
          errorData?.error ??
            "Không thể gửi tin nhắn tới AI Coach.",
        );
      }

      if (!response.body) {
        throw new Error(
          "Server không trả về streaming response.",
        );
      }

      const reader =
        response.body.getReader();

      const decoder = new TextDecoder();

      let buffer = "";

      while (true) {
        const { value, done } =
          await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, {
          stream: true,
        });

        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const parsedEvent =
            parseSseBlock(block);

          if (!parsedEvent) {
            continue;
          }

          const {
            event: eventName,
            data,
          } = parsedEvent;

          if (eventName === "meta") {
            const nextThreadId =
              typeof data.threadId ===
              "string"
                ? data.threadId
                : null;

            if (nextThreadId) {
              setThreadId(nextThreadId);

              window.history.replaceState(
                null,
                "",
                `/ai-coach?thread=${nextThreadId}`,
              );
            }

            updateUsage(data.usage);
          }

          if (eventName === "tool") {
            const toolName =
              typeof data.name === "string"
                ? data.name
                : "";

            const toolStatuses: Record<
              string,
              string
            > = {
              get_client_profile:
                "Đang đọc hồ sơ onboarding...",
              get_today_workout:
                "Đang đọc workout hôm nay...",
              get_recent_progress:
                "Đang phân tích tiến độ...",
              get_nutrition_summary:
                "Đang tổng hợp calories và macros...",
              create_workout_reminder:
                "Đang xử lý workout reminder...",
              create_support_ticket:
                "Đang xử lý support ticket...",
            };

            setStatus(
              toolStatuses[toolName] ??
                "Đang xử lý dữ liệu...",
            );
          }

          if (eventName === "delta") {
            const text =
              typeof data.text === "string"
                ? data.text
                : "";

            if (!text) {
              continue;
            }

            setStatus(
              "AI Coach đang trả lời...",
            );

            setMessages((current) =>
              current.map((message) =>
                message.id ===
                temporaryAssistantId
                  ? {
                      ...message,
                      content:
                        message.content + text,
                    }
                  : message,
              ),
            );
          }

          if (eventName === "done") {
            const finalMessageId =
              typeof data.messageId ===
              "string"
                ? data.messageId
                : temporaryAssistantId;

            setMessages((current) =>
              current.map((message) =>
                message.id ===
                temporaryAssistantId
                  ? {
                      ...message,
                      id: finalMessageId,
                    }
                  : message,
              ),
            );

            updateUsage(data.usage);
            setStatus("");
          }

          if (eventName === "error") {
            const serverMessage =
              typeof data.message ===
              "string"
                ? data.message
                : "AI Coach gặp lỗi.";

            throw new Error(serverMessage);
          }
        }
      }
    } catch (requestError) {
      const rawErrorMessage =
        getErrorMessage(requestError);
      const errorMessage =
        /openai\.com|no credits|incorrect api key|econnrefused|sk-/i.test(
          rawErrorMessage,
        )
          ? "AI Coach hiện chưa sẵn sàng. Vui lòng thử lại sau."
          : rawErrorMessage;

      setError(errorMessage);
      setStatus("");

      setMessages((current) =>
        current.map((message) =>
          message.id ===
          temporaryAssistantId
            ? {
                ...message,
                content:
                  `Không thể trả lời: ${errorMessage}`,
              }
            : message,
        ),
      );
    } finally {
      setSending(false);
    }
  }

  const suggestions = [
    "Hôm nay tôi nên tập gì?",
    "Phân tích tiến độ 7 ngày gần đây",
    "Tôi có ăn đủ protein không?",
    "Tôi nên cải thiện recovery như thế nào?",
  ];

  return (
    <main className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <section className="mb-5 flex flex-col gap-4 rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400">
            Personal intelligence
          </p>

          <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
            Muscle Fitness AI Coach
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            Phân tích workout, nutrition,
            progress và recovery dựa trên dữ
            liệu của bạn.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/ai-coach/history"
            className="inline-flex min-h-11 items-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-zinc-300 transition hover:bg-white/10"
          >
            History
          </Link>

          <Link
            href="/ai-coach/settings"
            className="inline-flex min-h-11 items-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-zinc-300 transition hover:bg-white/10"
          >
            Settings
          </Link>

          <button
            type="button"
            onClick={startNewConversation}
            disabled={sending}
            className="min-h-11 rounded-xl bg-amber-400 px-4 text-sm font-black text-black transition hover:bg-amber-300 disabled:opacity-50"
          >
            New chat
          </button>
        </div>
      </section>

      <section className="flex min-h-[650px] flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-950">
        <div className="flex-1 overflow-y-auto p-4 sm:p-7">
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-[480px] max-w-3xl flex-col items-center justify-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-400/10 text-4xl">
                🏋️
              </div>

              <h2 className="mt-6 text-2xl font-black text-white">
                Coach được xây dựng từ dữ liệu
                thật
              </h2>

              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">
                Hỏi về workout hôm nay,
                calories, protein, tiến độ hoặc
                recovery của bạn.
              </p>

              <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                {suggestions.map(
                  (suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={sending}
                      onClick={() =>
                        void sendMessage(
                          undefined,
                          suggestion,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left text-sm font-medium text-zinc-300 transition hover:border-amber-400/30 hover:bg-amber-400/5 disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-4xl flex-col gap-5">
              {messages.map((message) => {
                const isUser =
                  message.role === "user";

                return (
                  <div
                    key={message.id}
                    className={`flex ${
                      isUser
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[88%] whitespace-pre-wrap rounded-3xl px-5 py-4 text-sm leading-7 sm:max-w-[78%] ${
                        isUser
                          ? "rounded-br-md bg-amber-400 text-black"
                          : "rounded-bl-md border border-white/10 bg-white/[0.04] text-zinc-200"
                      }`}
                    >
                      {!isUser ? (
                        <p className="mb-2 text-xs font-black uppercase tracking-wider text-amber-400">
                          AI Coach
                        </p>
                      ) : null}

                      {message.content ||
                        (sending
                          ? "Đang suy nghĩ..."
                          : "")}
                    </div>
                  </div>
                );
              })}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-white/10 bg-black/40 p-4 sm:p-6">
          <div className="mx-auto max-w-4xl">
            {status ? (
              <p className="mb-3 text-xs font-semibold text-amber-300">
                {status}
              </p>
            ) : null}

            {error ? (
              <div className="mb-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            ) : null}

            <form
              onSubmit={(event) =>
                void sendMessage(event)
              }
              className="flex items-end gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-3 focus-within:border-amber-400/50"
            >
              <textarea
                value={input}
                onChange={(event) =>
                  setInput(event.target.value)
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey
                  ) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                rows={1}
                placeholder="Hỏi về workout, nutrition, progress..."
                className="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-zinc-600"
              />

              <button
                type="submit"
                disabled={
                  sending || !input.trim()
                }
                className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-amber-400 px-4 font-black text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? "..." : "Send"}
              </button>
            </form>

            <p className="mt-3 text-center text-[11px] text-zinc-600">
              AI Coach cung cấp hướng dẫn
              fitness tổng quát, không thay thế
              tư vấn y tế.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}