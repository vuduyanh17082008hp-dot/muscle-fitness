"use client";

import {
  Copy,
  Menu,
  Pencil,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export type AiCoachThreadSummary = {
  id: string;
  title: string;
  lastMessageAt: string;
};

type PendingProposal = {
  toolLogId: string;
  name: string;
  type: string;
  proposal: Record<string, unknown> | null;
};

type AiCoachClientProps = {
  initialThreadId: string | null;
  initialMessages: AiCoachUiMessage[];
  initialUsage: AiCoachUsage | null;
  initialThreads: AiCoachThreadSummary[];
};

type ServerSentEvent = {
  event: string;
  data: Record<string, unknown>;
};

function parseSseBlock(block: string): ServerSentEvent | null {
  const lines = block.split("\n");

  const event =
    lines
      .find((line) => line.startsWith("event:"))
      ?.slice("event:".length)
      .trim() ?? "message";

  const dataText = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");

  if (!dataText) {
    return null;
  }

  try {
    return {
      event,
      data: JSON.parse(dataText) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

const SAFE_AI_ERROR =
  "AI Coach hiện chưa sẵn sàng. Vui lòng thử lại sau.";

function looksLikeRawProviderError(message: string): boolean {
  return /openai\.com|openrouter\.ai|no credits|credits remaining|incorrect api key|econnrefused|insufficient_quota|sk-|billing/i.test(
    message,
  );
}

function getErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : "AI Coach gặp lỗi không xác định.";

  if (looksLikeRawProviderError(raw)) {
    return SAFE_AI_ERROR;
  }

  return raw;
}

function readApiErrorMessage(errorData: unknown): string {
  if (!errorData || typeof errorData !== "object") {
    return "Không thể gửi tin nhắn tới AI Coach.";
  }

  const data = errorData as Record<string, unknown>;

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }

  if (typeof data.error === "string" && data.error !== "AI_UNAVAILABLE") {
    return data.error;
  }

  if (data.error === "AI_UNAVAILABLE") {
    return SAFE_AI_ERROR;
  }

  return "Không thể gửi tin nhắn tới AI Coach.";
}

export function AiCoachClient({
  initialThreadId,
  initialMessages,
  initialUsage,
  initialThreads,
}: AiCoachClientProps) {
  const router = useRouter();
  const [threadId, setThreadId] = useState<string | null>(
    initialThreadId,
  );
  const [threads, setThreads] =
    useState<AiCoachThreadSummary[]>(initialThreads);
  const [messages, setMessages] =
    useState<AiCoachUiMessage[]>(initialMessages);
  const [usage, setUsage] = useState<AiCoachUsage | null>(
    initialUsage,
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const [feedbackByMessage, setFeedbackByMessage] = useState<
    Record<string, 1 | -1>
  >({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, status, proposals]);

  function startNewConversation() {
    if (sending) {
      return;
    }

    setThreadId(null);
    setMessages([]);
    setInput("");
    setError("");
    setStatus("");
    setProposals([]);
    setSidebarOpen(false);
    window.history.replaceState(null, "", "/ai-coach");
  }

  function updateUsage(rawUsage: unknown) {
    if (!rawUsage || typeof rawUsage !== "object") {
      return;
    }

    const candidate = rawUsage as Record<string, unknown>;

    setUsage({
      plan_code:
        typeof candidate.plan_code === "string"
          ? candidate.plan_code
          : "free",
      messages_used:
        typeof candidate.messages_used === "number"
          ? candidate.messages_used
          : 0,
      daily_limit:
        typeof candidate.daily_limit === "number"
          ? candidate.daily_limit
          : 5,
      remaining:
        typeof candidate.remaining === "number"
          ? candidate.remaining
          : 0,
    });
  }

  async function openThread(nextThreadId: string) {
    if (sending || nextThreadId === threadId) {
      setSidebarOpen(false);
      return;
    }

    setSidebarOpen(false);
    setError("");
    setStatus("");
    setProposals([]);
    setThreadId(nextThreadId);
    window.history.replaceState(
      null,
      "",
      `/ai-coach?thread=${nextThreadId}`,
    );

    try {
      const response = await fetch(
        `/api/ai-coach/thread/${nextThreadId}/messages`,
      );

      if (response.ok) {
        const data = (await response.json()) as {
          messages?: AiCoachUiMessage[];
        };

        if (Array.isArray(data.messages)) {
          setMessages(data.messages);
          return;
        }
      }
    } catch {
      // Fall through to soft navigation reload.
    }

    router.push(`/ai-coach?thread=${nextThreadId}`);
  }

  async function renameCurrentThread() {
    if (!threadId || sending) {
      return;
    }

    const current =
      threads.find((thread) => thread.id === threadId)?.title ??
      "New conversation";
    const nextTitle = window.prompt("Rename conversation", current);

    if (!nextTitle?.trim()) {
      return;
    }

    const response = await fetch(`/api/ai-coach/thread/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle.trim() }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      window.alert(data?.error || "Không thể đổi tên.");
      return;
    }

    setThreads((currentThreads) =>
      currentThreads.map((thread) =>
        thread.id === threadId
          ? { ...thread, title: nextTitle.trim() }
          : thread,
      ),
    );
  }

  async function deleteCurrentThread() {
    if (!threadId || sending) {
      return;
    }

    const confirmed = window.confirm(
      "Xóa vĩnh viễn cuộc trò chuyện này?",
    );

    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/ai-coach/thread/${threadId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      window.alert(data?.error || "Không thể xóa.");
      return;
    }

    setThreads((currentThreads) =>
      currentThreads.filter((thread) => thread.id !== threadId),
    );
    startNewConversation();
  }

  async function copyMessage(message: AiCoachUiMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      window.alert("Không thể copy nội dung.");
    }
  }

  async function sendFeedback(
    messageId: string,
    rating: 1 | -1,
  ) {
    if (!threadId || messageId.startsWith("assistant-")) {
      return;
    }

    const response = await fetch("/api/ai-coach/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId,
        messageId,
        rating,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      window.alert(data?.error || "Không thể gửi feedback.");
      return;
    }

    setFeedbackByMessage((current) => ({
      ...current,
      [messageId]: rating,
    }));
  }

  async function resolveProposal(
    toolLogId: string,
    action: "confirm" | "cancel",
  ) {
    const response = await fetch("/api/ai-coach/tools/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolLogId, action }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      window.alert(data?.error || "Không thể xử lý đề xuất.");
      return;
    }

    setProposals((current) =>
      current.filter((item) => item.toolLogId !== toolLogId),
    );
  }

  function stopGeneration() {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setStatus("");
  }

  async function sendMessage(
    event?: FormEvent<HTMLFormElement>,
    suggestedMessage?: string,
  ) {
    event?.preventDefault();

    if (sending) {
      return;
    }

    const messageToSend = (suggestedMessage ?? input).trim();

    if (!messageToSend) {
      return;
    }

    const temporaryUserId = `user-${crypto.randomUUID()}`;
    const temporaryAssistantId = `assistant-${crypto.randomUUID()}`;
    const idempotencyKey = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const controller = new AbortController();
    abortRef.current = controller;

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
    setProposals([]);
    setSending(true);
    setStatus("AI Coach đang đọc dữ liệu của bạn...");

    try {
      const response = await fetch("/api/ai-coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          threadId,
          message: messageToSend,
          attachment: null,
          idempotencyKey,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);

        if (
          errorData &&
          typeof errorData === "object" &&
          "usage" in errorData
        ) {
          updateUsage((errorData as { usage: unknown }).usage);
        }

        throw new Error(readApiErrorMessage(errorData));
      }

      if (!response.body) {
        throw new Error("Server không trả về streaming response.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const parsedEvent = parseSseBlock(block);

          if (!parsedEvent) {
            continue;
          }

          const { event: eventName, data } = parsedEvent;

          if (eventName === "meta") {
            const nextThreadId =
              typeof data.threadId === "string" ? data.threadId : null;

            if (nextThreadId) {
              setThreadId(nextThreadId);
              window.history.replaceState(
                null,
                "",
                `/ai-coach?thread=${nextThreadId}`,
              );

              setThreads((current) => {
                if (current.some((thread) => thread.id === nextThreadId)) {
                  return current.map((thread) =>
                    thread.id === nextThreadId
                      ? {
                          ...thread,
                          title:
                            thread.title === "New conversation"
                              ? messageToSend.slice(0, 64)
                              : thread.title,
                          lastMessageAt: createdAt,
                        }
                      : thread,
                  );
                }

                return [
                  {
                    id: nextThreadId,
                    title: messageToSend.slice(0, 64),
                    lastMessageAt: createdAt,
                  },
                  ...current,
                ];
              });
            }

            updateUsage(data.usage);
          }

          if (eventName === "tool") {
            const toolName =
              typeof data.name === "string" ? data.name : "";

            const toolStatuses: Record<string, string> = {
              get_client_profile: "Đang đọc hồ sơ...",
              get_today_workout: "Đang đọc workout hôm nay...",
              get_recent_workouts: "Đang đọc lịch sử tập...",
              get_workout_history: "Đang đọc workout history...",
              get_recent_progress: "Đang phân tích tiến độ...",
              get_weight_trend: "Đang phân tích cân nặng...",
              get_nutrition_summary: "Đang tổng hợp dinh dưỡng...",
              get_today_nutrition: "Đang đọc nutrition hôm nay...",
              get_recent_checkins: "Đang đọc check-in...",
              get_training_adherence: "Đang tính adherence...",
              get_weekly_summary: "Đang tạo weekly summary...",
              propose_reminder: "Đang đề xuất reminder...",
              propose_support_ticket: "Đang đề xuất ticket...",
              propose_workout_adjustment: "Đang đề xuất chỉnh workout...",
              propose_nutrition_adjustment:
                "Đang đề xuất chỉnh nutrition...",
            };

            setStatus(toolStatuses[toolName] ?? "Đang xử lý dữ liệu...");
          }

          if (eventName === "proposals") {
            const items = Array.isArray(data.items) ? data.items : [];
            setProposals(
              items
                .map((item) => {
                  if (!item || typeof item !== "object") {
                    return null;
                  }

                  const record = item as Record<string, unknown>;

                  if (typeof record.toolLogId !== "string") {
                    return null;
                  }

                  return {
                    toolLogId: record.toolLogId,
                    name:
                      typeof record.name === "string"
                        ? record.name
                        : "proposal",
                    type:
                      typeof record.type === "string"
                        ? record.type
                        : "proposal",
                    proposal:
                      record.proposal &&
                      typeof record.proposal === "object"
                        ? (record.proposal as Record<string, unknown>)
                        : null,
                  } satisfies PendingProposal;
                })
                .filter((item): item is PendingProposal => item !== null),
            );
          }

          if (eventName === "delta") {
            const text =
              typeof data.text === "string" ? data.text : "";

            if (!text) {
              continue;
            }

            setStatus("AI Coach đang trả lời...");
            setMessages((current) =>
              current.map((message) =>
                message.id === temporaryAssistantId
                  ? {
                      ...message,
                      content: message.content + text,
                    }
                  : message,
              ),
            );
          }

          if (eventName === "done") {
            const finalMessageId =
              typeof data.messageId === "string"
                ? data.messageId
                : temporaryAssistantId;

            setMessages((current) =>
              current.map((message) =>
                message.id === temporaryAssistantId
                  ? { ...message, id: finalMessageId }
                  : message,
              ),
            );

            updateUsage(data.usage);
            setStatus("");
          }

          if (eventName === "error") {
            const serverMessage =
              typeof data.message === "string"
                ? data.message
                : SAFE_AI_ERROR;

            throw new Error(serverMessage);
          }
        }
      }
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === "AbortError"
      ) {
        setStatus("Đã dừng phản hồi.");
        setMessages((current) =>
          current.filter(
            (message) =>
              message.id !== temporaryAssistantId ||
              message.content.trim().length > 0,
          ),
        );
      } else {
        setError(getErrorMessage(requestError));
        setStatus("");
        setMessages((current) =>
          current.filter(
            (message) => message.id !== temporaryAssistantId,
          ),
        );
      }
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }

  function retryLastUserMessage() {
    if (sending) {
      return;
    }

    let lastUser: AiCoachUiMessage | undefined;

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "user") {
        lastUser = messages[i];
        break;
      }
    }

    if (!lastUser?.content.trim()) {
      return;
    }

    const retryContent = lastUser.content;
    const retryId = lastUser.id;

    setMessages((current) =>
      current.filter((message) => message.id !== retryId),
    );

    void sendMessage(undefined, retryContent);
  }

  const suggestions = [
    "What should I train today?",
    "How is my progress this week?",
    "Am I eating enough protein?",
    "Should I change today's workout?",
    "Summarize my last 7 days.",
    "Why has my weight stalled?",
    "How is my recovery looking?",
  ];

  const activeTitle =
    threads.find((thread) => thread.id === threadId)?.title ??
    "New conversation";

  return (
    <main className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-7xl gap-4 px-4 py-6 sm:px-6 lg:px-8">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close conversations"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col border-r border-white/10 bg-zinc-950 p-4 transition lg:static lg:z-0 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
            Conversations
          </p>
          <button
            type="button"
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 lg:hidden"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={startNewConversation}
          disabled={sending}
          className="mb-4 min-h-11 rounded-xl bg-amber-400 px-4 text-sm font-black text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          New conversation
        </button>

        <div className="flex-1 space-y-2 overflow-y-auto">
          {threads.length === 0 ? (
            <p className="px-2 text-sm text-zinc-500">
              Chưa có cuộc trò chuyện.
            </p>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => void openThread(thread.id)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                  thread.id === threadId
                    ? "border-amber-400/40 bg-amber-400/10"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                }`}
              >
                <p className="truncate text-sm font-semibold text-white">
                  {thread.title}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {new Intl.DateTimeFormat("vi-VN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(thread.lastMessageAt))}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="mt-4 grid gap-2 border-t border-white/10 pt-4">
          <Link
            href="/ai-coach/history"
            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
          >
            History
          </Link>
          <Link
            href="/ai-coach/settings"
            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
          >
            Settings
          </Link>
        </div>
      </aside>

      <section className="flex min-h-[650px] min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-950">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/10 p-2 text-zinc-300 lg:hidden"
                aria-label="Open conversations"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">
                  Muscle Fitness AI Coach
                </p>
                <h1 className="truncate text-lg font-black text-white sm:text-xl">
                  {activeTitle}
                </h1>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void renameCurrentThread()}
              disabled={!threadId || sending}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-zinc-300 disabled:opacity-40"
            >
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </button>
            <button
              type="button"
              onClick={() => void deleteCurrentThread()}
              disabled={!threadId || sending}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-500/20 px-3 text-xs font-semibold text-red-300 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-7">
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-[480px] max-w-3xl flex-col items-center justify-center text-center">
              <h2 className="text-2xl font-black text-white">
                Coach built from your real data
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">
                Ask about today&apos;s workout, protein, progress, or
                recovery. Answers use your authenticated Muscle Fitness
                records.
              </p>
              <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={sending}
                    onClick={() => void sendMessage(undefined, suggestion)}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left text-sm font-medium text-zinc-300 transition hover:border-amber-400/30 hover:bg-amber-400/5 disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-4xl flex-col gap-5">
              {messages.map((message) => {
                const isUser = message.role === "user";

                return (
                  <div
                    key={message.id}
                    className={`flex ${
                      isUser ? "justify-end" : "justify-start"
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
                        (sending ? "Đang suy nghĩ..." : "")}

                      {!isUser && message.content ? (
                        <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
                          <button
                            type="button"
                            onClick={() => void copyMessage(message)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-400 hover:bg-white/5 hover:text-white"
                            aria-label="Copy response"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            {copiedId === message.id ? "Copied" : "Copy"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void sendFeedback(message.id, 1)
                            }
                            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold hover:bg-white/5 ${
                              feedbackByMessage[message.id] === 1
                                ? "text-amber-300"
                                : "text-zinc-400 hover:text-white"
                            }`}
                            aria-label="Thumbs up"
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void sendFeedback(message.id, -1)
                            }
                            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold hover:bg-white/5 ${
                              feedbackByMessage[message.id] === -1
                                ? "text-red-300"
                                : "text-zinc-400 hover:text-white"
                            }`}
                            aria-label="Thumbs down"
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {proposals.length > 0 ? (
                <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
                  <p className="text-sm font-bold text-amber-300">
                    AI Coach recommends these changes
                  </p>
                  {proposals.map((proposal) => (
                    <div
                      key={proposal.toolLogId}
                      className="rounded-xl border border-white/10 bg-black/30 p-3"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                        {proposal.type}
                      </p>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-zinc-300">
                        {JSON.stringify(proposal.proposal, null, 2)}
                      </pre>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void resolveProposal(
                              proposal.toolLogId,
                              "confirm",
                            )
                          }
                          className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-black"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void resolveProposal(
                              proposal.toolLogId,
                              "cancel",
                            )
                          }
                          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-zinc-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-white/10 bg-black/40 p-4 sm:p-6">
          <div className="mx-auto max-w-4xl">
            {usage ? (
              <p className="mb-3 text-xs text-zinc-500">
                Còn {usage.remaining}/{usage.daily_limit} lượt AI hôm nay
              </p>
            ) : null}

            {status ? (
              <p
                className="mb-3 text-xs font-semibold text-amber-300"
                aria-live="polite"
              >
                {status}
              </p>
            ) : null}

            {error ? (
              <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 sm:flex-row sm:items-center sm:justify-between">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={retryLastUserMessage}
                  disabled={sending}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 text-xs font-bold uppercase tracking-wide text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  Try again
                </button>
              </div>
            ) : null}

            <form
              onSubmit={(event) => void sendMessage(event)}
              className="flex items-end gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-3 focus-within:border-amber-400/50"
            >
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                rows={1}
                placeholder="Ask about workout, nutrition, progress..."
                className="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-zinc-600"
              />

              {sending ? (
                <button
                  type="button"
                  onClick={stopGeneration}
                  className="flex h-12 min-w-12 items-center justify-center gap-2 rounded-2xl border border-white/15 px-4 text-sm font-bold text-white"
                  aria-label="Stop generating"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-amber-400 px-4 font-black text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Send
                </button>
              )}
            </form>

            <p className="mt-3 text-center text-[11px] text-zinc-600">
              AI Coach provides general fitness guidance and is not a
              substitute for medical advice.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
