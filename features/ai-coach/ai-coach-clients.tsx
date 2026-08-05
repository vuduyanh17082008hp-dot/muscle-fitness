"use client";

import {
  Bot,
  Dumbbell,
  LoaderCircle,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  pending?: boolean;
};

type UsageInfo = {
  plan_code: string;
  messages_used: number;
  daily_limit: number;
  remaining: number;
};

type AttachmentPayload = {
  kind: "image" | "file";
  filename: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

type AiCoachClientProps = {
  initialThreadId: string | null;
  initialMessages: UiMessage[];
  initialUsage: UsageInfo | null;
};

const suggestions = [
  "Hôm nay tôi nên tập gì?",
  "Phân tích tiến độ 7 ngày gần đây",
  "Tôi có đang ăn đủ protein không?",
  "Gợi ý điều chỉnh recovery hôm nay",
];

function readFileAsDataUrl(
  file: File,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(
          new Error("Không thể đọc file này."),
        );
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(
        new Error("Không thể đọc file này."),
      );
    };

    reader.readAsDataURL(file);
  });
}

export function AiCoachClient({
  initialThreadId,
  initialMessages,
  initialUsage,
}: AiCoachClientProps) {
  const [threadId, setThreadId] = useState(
    initialThreadId,
  );

  const [messages, setMessages] =
    useState<UiMessage[]>(initialMessages);

  const [usage, setUsage] =
    useState<UsageInfo | null>(initialUsage);

  const [input, setInput] = useState("");
  const [attachment, setAttachment] =
    useState<AttachmentPayload | null>(null);

  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(
    null,
  );

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, status]);

  function startNewConversation() {
    if (sending) {
      return;
    }

    setThreadId(null);
    setMessages([]);
    setInput("");
    setAttachment(null);
    setError("");
    setStatus("");

    window.history.replaceState(
      null,
      "",
      "/ai-coach",
    );
  }

  async function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.size > 4_500_000) {
      setError(
        "File phải nhỏ hơn khoảng 4 MB.",
      );
      return;
    }

    const acceptedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/json",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    if (
      file.type &&
      !acceptedMimeTypes.includes(file.type)
    ) {
      setError(
        "Định dạng chưa được hỗ trợ. Hãy dùng ảnh, PDF, Word, Excel, CSV, JSON hoặc TXT.",
      );
      return;
    }

    try {
      const dataUrl =
        await readFileAsDataUrl(file);

      setAttachment({
        kind: file.type.startsWith("image/")
          ? "image"
          : "file",
        filename: file.name,
        mimeType:
          file.type || "application/octet-stream",
        size: file.size,
        dataUrl,
      });

      setError("");
    } catch (fileError) {
      setError(
        fileError instanceof Error
          ? fileError.message
          : "Không thể đọc file.",
      );
    }
  }

  async function submitFeedback(
    messageId: string,
    rating: 1 | -1,
  ) {
    if (!threadId) {
      return;
    }

    try {
      await fetch("/api/ai-coach/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId,
          messageId,
          rating,
        }),
      });
    } catch {
      // Feedback should not interrupt the chat.
    }
  }

  async function sendMessage(
    event?: FormEvent,
    providedMessage?: string,
  ) {
    event?.preventDefault();

    if (sending) {
      return;
    }

    const cleanInput =
      (providedMessage ?? input).trim();

    const messageToSend =
      cleanInput ||
      (attachment
        ? "Hãy phân tích file hoặc hình ảnh đính kèm."
        : "");

    if (!messageToSend) {
      return;
    }

    setSending(true);
    setError("");
    setStatus("AI Coach đang đọc dữ liệu của bạn...");

    const timestamp = new Date().toISOString();
    const localUserId = `user-${Date.now()}`;
    const localAssistantId = `assistant-${Date.now()}`;

    setMessages((current) => [
      ...current,
      {
        id: localUserId,
        role: "user",
        content: messageToSend,
        createdAt: timestamp,
      },
      {
        id: localAssistantId,
        role: "assistant",
        content: "",
        createdAt: timestamp,
        pending: true,
      },
    ]);

    setInput("");

    const submittedAttachment = attachment;
    setAttachment(null);

    try {
      const response = await fetch(
        "/api/ai-coach/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            threadId,
            message: messageToSend,
            attachment: submittedAttachment,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => null);

        if (errorData?.usage) {
          setUsage(errorData.usage);
        }

        throw new Error(
          errorData?.error ||
            "Không thể gửi tin nhắn.",
        );
      }

      if (!response.body) {
        throw new Error(
          "Server không trả về streaming response.",
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamedThreadId = threadId;

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
          const lines = block.split("\n");

          const eventName =
            lines
              .find((line) =>
                line.startsWith("event:"),
              )
              ?.slice(6)
              .trim() || "message";

          const dataText = lines
            .filter((line) =>
              line.startsWith("data:"),
            )
            .map((line) => line.slice(5).trim())
            .join("\n");

          if (!dataText) {
            continue;
          }

          const data = JSON.parse(dataText);

          if (eventName === "meta") {
            streamedThreadId = data.threadId;
            setThreadId(data.threadId);
            setUsage(data.usage);

            window.history.replaceState(
              null,
              "",
              `/ai-coach?thread=${data.threadId}`,
            );
          }

          if (eventName === "tool") {
            const labels: Record<string, string> = {
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
              labels[data.name] ||
                "Đang xử lý dữ liệu...",
            );
          }

          if (eventName === "delta") {
            setStatus("AI Coach đang trả lời...");

            setMessages((current) =>
              current.map((message) =>
                message.id === localAssistantId
                  ? {
                      ...message,
                      content:
                        message.content + data.text,
                    }
                  : message,
              ),
            );
          }

          if (eventName === "done") {
            setThreadId(
              data.threadId ?? streamedThreadId,
            );

            if (data.usage) {
              setUsage(data.usage);
            }

            setMessages((current) =>
              current.map((message) =>
                message.id === localAssistantId
                  ? {
                      ...message,
                      id:
                        data.messageId ??
                        localAssistantId,
                      pending: false,
                    }
                  : message,
              ),
            );

            setStatus("");
          }

          if (eventName === "error") {
            throw new Error(
              data.message ||
                "AI Coach gặp lỗi.",
            );
          }
        }
      }
    } catch (sendError) {
      const message =
        sendError instanceof Error
          ? sendError.message
          : "AI Coach gặp lỗi.";

      setError(message);
      setStatus("");

      setMessages((current) =>
        current.map((item) =>
          item.id === localAssistantId
            ? {
                ...item,
                content: `Không thể trả lời: ${message}`,
                pending: false,
              }
            : item,
        ),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <section className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">
            <Sparkles className="h-4 w-4" />
            Personal intelligence
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            Muscle Fitness AI Coach
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Workout, nutrition, progress và recovery
            được phân tích theo chính dữ liệu của bạn.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {usage ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                {usage.plan_code} plan
              </p>

              <p className="mt-1 text-sm font-semibold text-white">
                {usage.remaining}/{usage.daily_limit} lượt còn lại
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={startNewConversation}
            disabled={sending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            New chat
          </button>
        </div>
      </section>

      <section className="flex flex-1 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 shadow-2xl shadow-black/40">
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-[480px] max-w-3xl flex-col items-center justify-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-amber-400/30 bg-amber-400/10">
                <Bot className="h-10 w-10 text-amber-400" />
              </div>

              <h2 className="mt-6 text-2xl font-black text-white">
                Coach được xây dựng từ dữ liệu thật
              </h2>

              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                Hỏi về workout hôm nay, calories,
                protein, tiến độ hoặc recovery. Bạn cũng
                có thể đính kèm ảnh và tài liệu.
              </p>

              <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() =>
                      void sendMessage(
                        undefined,
                        suggestion,
                      )
                    }
                    disabled={sending}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left text-sm font-medium text-zinc-200 transition hover:border-amber-400/30 hover:bg-amber-400/5 disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-4xl flex-col gap-5">
              {messages.map((message) => {
                const isUser =
                  message.role === "user";

                return (
                  <article
                    key={message.id}
                    className={`flex ${
                      isUser
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[88%] rounded-3xl px-5 py-4 sm:max-w-[78%] ${
                        isUser
                          ? "rounded-br-md bg-amber-400 text-black"
                          : "rounded-bl-md border border-white/10 bg-white/[0.04] text-zinc-100"
                      }`}
                    >
                      {!isUser ? (
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-400">
                          <Dumbbell className="h-4 w-4" />
                          AI Coach
                        </div>
                      ) : null}

                      <div className="whitespace-pre-wrap text-sm leading-7">
                        {message.content ||
                          (message.pending
                            ? "..."
                            : "")}
                      </div>

                      {!isUser &&
                      !message.pending &&
                      !message.id.startsWith(
                        "assistant-",
                      ) ? (
                        <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3">
                          <button
                            type="button"
                            onClick={() =>
                              void submitFeedback(
                                message.id,
                                1,
                              )
                            }
                            className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/10 hover:text-emerald-400"
                            aria-label="Helpful answer"
                          >
                            <ThumbsUp className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void submitFeedback(
                                message.id,
                                -1,
                              )
                            }
                            className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/10 hover:text-red-400"
                            aria-label="Unhelpful answer"
                          >
                            <ThumbsDown className="h-4 w-4" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-white/10 bg-black/40 p-4 sm:p-6">
          <div className="mx-auto max-w-4xl">
            {status ? (
              <div className="mb-3 flex items-center gap-2 text-xs font-medium text-amber-300">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {status}
              </div>
            ) : null}

            {error ? (
              <div className="mb-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            ) : null}

            {attachment ? (
              <div className="mb-3 flex items-center justify-between rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {attachment.filename}
                  </p>

                  <p className="mt-1 text-xs text-zinc-500">
                    {(attachment.size / 1024).toFixed(0)} KB
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
                  aria-label="Remove attachment"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            <form
              onSubmit={(event) =>
                void sendMessage(event)
              }
              className="flex items-end gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-3 focus-within:border-amber-400/40"
            >
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv,application/json,.docx,.xlsx"
                onChange={(event) =>
                  void handleFileChange(event)
                }
              />

              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                disabled={sending}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                aria-label="Attach file"
              >
                <Paperclip className="h-5 w-5" />
              </button>

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
                placeholder="Hỏi AI Coach về workout, nutrition hoặc progress..."
                className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600"
              />

              <button
                type="submit"
                disabled={
                  sending ||
                  (!input.trim() && !attachment)
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                {sending ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </form>

            <p className="mt-3 text-center text-[11px] leading-5 text-zinc-600">
              AI Coach cung cấp hướng dẫn fitness tổng
              quát, không thay thế chẩn đoán hoặc điều trị
              y tế.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}