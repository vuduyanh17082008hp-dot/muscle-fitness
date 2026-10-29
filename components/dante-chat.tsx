"use client";

import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  FormEvent,
  KeyboardEvent,
} from "react";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

import {
  DANTE_STATE_LABEL,
  useDantePresence,
  type DanteActivity,
} from "@/components/dante/dante-presence";
import { cn } from "@/lib/utils";
import { FORM_COACH_HANDOFF_KEY } from "@/lib/form-coach/handoff";
import {
  DANTE_SESSION_EXPIRED_MESSAGE,
  DANTE_UNAVAILABLE_MESSAGE,
  danteHttpFailureCopy,
  isDanteRateLimitedMessage,
} from "@/lib/dante-chat-http-error";
import type { DanteInsight } from "@/lib/dante-core/insight";
import { COACH_CONTEXT_CHANGED_EVENT, COACH_TURN_STARTED_EVENT } from "@/lib/coach-context-event";
import {
  parseChatStreamChunk,
  resolveAbortedContent,
  resolveConfirmationOutcome,
  resolveStreamErrorContent,
  type ChatStreamEvent,
  type ChatStreamSource,
} from "@/lib/dante-core/chat-stream-protocol";
import type { StoredDanteMessage } from "@/lib/dante-core/conversation-store";

/* =========================================================
   TYPES
========================================================= */

type PendingConfirmation = {
  actionId: string;
  toolName: string;
  summary: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Client clock when the user turn was created — optional risk timing. */
  createdAt?: string;
  insight?: DanteInsight | null;
  sources?: ChatStreamSource[] | null;
  pendingConfirmation?: PendingConfirmation | null;
  confirmationResolution?: ConfirmationResolution;
  isComplete?: boolean;
  wasAborted?: boolean;
  /** Client id of the turn (user message + its reply) — what a retry resends so the server never duplicates it. */
  turnId?: string;
  /** Set when the reply was never confirmed complete (refresh/disconnect mid-stream, or a failure). */
  historyStatus?: "pending" | "interrupted" | "error";
  /** The server said this turn did NOT reach conversation history. */
  notSaved?: boolean;
};

type ConfirmationResolution = "confirmed" | "cancelled" | "failed" | "expired" | "unknown" | null;

type ThreadSummary = { id: string; title: string; updatedAt: string };

function fromStoredMessage(message: StoredDanteMessage): ChatMessage {
  if (message.role === "user") {
    return { id: message.id, role: "user", content: message.content, createdAt: message.createdAt, turnId: message.clientMessageId ?? undefined };
  }
  return {
    id: message.id,
    role: "assistant",
    content: message.status === "error" ? resolveStreamErrorContent(message.content, false, DANTE_UNAVAILABLE_MESSAGE) : message.content,
    insight: message.insight ?? null,
    sources: message.sources ?? [],
    pendingConfirmation: message.pendingConfirmation,
    confirmationResolution: message.confirmationResolution,
    isComplete: true,
    turnId: message.clientMessageId ?? undefined,
    historyStatus: message.status === "complete" ? undefined : message.status,
  };
}

export type QuickPrompt = {
  tag?: string;
  label: string;
  prompt: string;
};

const QUICK_PROMPTS: QuickPrompt[] = [
  {
    tag: "Today's training",
    label: "What should I train today?",
    prompt: "Based on my current readiness, what should I train today?",
  },
  {
    tag: "Nutrition target",
    label: "How do I hit my protein target?",
    prompt: "What should I eat to hit my remaining protein target?",
  },
  {
    tag: "Recovery",
    label: "How is my recovery looking?",
    prompt: "How is my recovery looking today, and what is driving it?",
  },
  {
    tag: "30-day trajectory",
    label: "How did I progress this month?",
    prompt: "How did my training and recovery progress over the last 30 days?",
  },
];

/* =========================================================
   PUBLIC PROPS
========================================================= */

export type DanteChatProps = {
  welcomeMessage?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  quickPrompts?: QuickPrompt[];
  /**
   * Real-state-aware conversation starters (spec: "Contextual
   * Suggestions") — built server-side from the caller's own already-
   * loaded data via lib/dante-core/build-chat-suggestions.ts. When
   * provided, these replace `quickPrompts` in the empty state. Omit
   * when there is no per-user signal to fall back to the generic starters.
   */
  contextualSuggestions?: DanteInsight[];
  compact?: boolean;
  className?: string;
  /**
   * Small, structured, additive fields merged into the /api/chatbot
   * request body — e.g. { selectedMuscle: "trapezius" } from the
   * Muscle Intelligence Atlas's "Ask Dante" tab. Never a raw data
   * dump; the server independently validates/re-resolves anything
   * sent here (see getSelectedMuscle in app/api/chatbot/route.ts)
   * rather than trusting it blindly.
   */
  contextPayload?: Record<string, unknown>;
  /**
   * Restore the saved conversation on mount (`?c=<id>` when not compact, otherwise the most recent one) and show
   * the history picker. Contextual embeds leave this off: their turns are still saved, each embed starts fresh.
   */
  restoreHistory?: boolean;
  /**
   * One line of the athlete's CURRENT data, built server-side from what actually loaded (never guessed). Shown under the
   * header so older replies in a restored conversation are never mistaken for today's numbers.
   */
  contextLine?: string | null;
};

/** The conversation this tab last had open ("" = a new, unsaved chat), so returning to Dante reopens it. */
const LAST_THREAD_KEY = "mf.dante.lastThread";

function readLastThread(): string | null {
  try {
    return window.sessionStorage.getItem(LAST_THREAD_KEY);
  } catch {
    return null;
  }
}

function rememberThread(id: string | null) {
  try {
    window.sessionStorage.setItem(LAST_THREAD_KEY, id ?? "");
  } catch {
    // storage blocked — restore falls back to the most recent conversation
  }
}

function formatAsOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "earlier";
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

const DEFAULT_WELCOME_MESSAGE =
  "Hi. I'm **Dante**, your Muscle Fitness intelligence coach. Ask me about your training, nutrition, recovery or progress.";

const SEVERITY_DOT: Record<string, string> = {
  warning: "bg-rose-400",
  notice: "bg-amber-400",
  info: "bg-[var(--mf-violet)]",
};

/**
 * "Why This?" evidence panel (spec: "Why This?" / "Explainable
 * Recommendation Model"). Renders a DanteInsight's real evidence and
 * a real next-action button — nothing here is LLM-generated, and
 * nothing renders when there's genuinely no evidence or action to
 * show (an insight with empty `evidence`/`reasons`/`nextAction`
 * simply shows nothing beyond its headline, which the markdown reply
 * above it already covers).
 */
function DanteInsightPanel({ insight }: { insight: DanteInsight }) {
  const hasWhy = insight.reasons.length > 0 || insight.evidence.length > 0;

  if (!hasWhy && !insight.nextAction) {
    return null;
  }

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {insight.nextAction ? (
          <Link
            href={insight.nextAction.href}
            className="inline-flex min-h-11 items-center rounded-xl bg-mf-glass-brand px-4 text-sm font-semibold text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
          >
            {insight.nextAction.label}
          </Link>
        ) : null}

        {hasWhy ? (
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-mf-glass-border px-4 text-sm font-semibold text-mf-glass-text-secondary transition hover:bg-white/[0.06]">
              {insight.severity ? (
                <span
                  className={cn("size-1.5 rounded-full", SEVERITY_DOT[insight.severity])}
                  aria-hidden="true"
                />
              ) : null}
              Why this?
            </summary>

            <div className="mt-3 space-y-3 rounded-2xl border border-white/8 bg-black/20 p-4">
              {insight.reasons.length > 0 ? (
                <ul className="space-y-1.5">
                  {insight.reasons.map((reason, index) => (
                    <li key={index} className="text-sm leading-6 text-zinc-300">
                      • {reason}
                    </li>
                  ))}
                </ul>
              ) : null}

              {insight.evidence.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {insight.evidence.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5"
                    >
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-600">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-white">{item.value}</p>
                      {item.note ? (
                        <p className="mt-0.5 text-xs text-zinc-500">{item.note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {insight.confidence ? (
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-600">
                  {insight.confidence} confidence
                </p>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

/* =========================================================
   SOURCES — citation provenance for evidence-grounded replies
   (retrieved Knowledge Brain chunks + live external evidence, see
   getSources() in app/api/chatbot/route.ts). Plain text/links only —
   these are server-computed titles/URLs, never raw retrieved content
   rendered as markup, so no sanitization is needed here the way
   message.content needs rehypeSanitize. Renders nothing when there
   are no sources rather than an empty "Sources" section.
========================================================= */

function DanteSourcesPanel({ sources }: { sources: ChatStreamSource[] }) {
  const safeSources = sources.filter(
    (source) =>
      source.title.trim().length > 0 &&
      /^https?:\/\//i.test(source.url.trim()),
  );

  if (safeSources.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 flex flex-col gap-2">
      <details className="group">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-mf-glass-border px-4 text-sm font-semibold text-mf-glass-text-secondary transition hover:bg-white/[0.06]">
          Sources ({safeSources.length})
        </summary>

        <ul className="mt-3 space-y-2 rounded-2xl border border-white/8 bg-black/20 p-4">
          {safeSources.map((source, index) => (
            <li key={`${source.url}-${index}`} className="text-sm leading-6">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 underline decoration-amber-400/30 underline-offset-2 hover:text-amber-300"
              >
                {source.title}
              </a>
              {source.type ? (
                <span className="ml-2 text-xs font-bold uppercase tracking-[0.1em] text-zinc-600">
                  {source.type}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/* =========================================================
   PENDING CONFIRMATION — Dante Actions/Agentic Interface (Part 7).
   Real CONFIRM/CANCEL buttons: nothing was saved when this message
   arrived, and nothing is saved until CONFIRM actually succeeds.
========================================================= */

function PendingConfirmationPanel({
  pendingConfirmation,
  resolution,
  isBusy,
  onConfirm,
  onCancel,
}: {
  pendingConfirmation: PendingConfirmation;
  resolution: ConfirmationResolution | undefined;
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Restored from history: dante_tool_actions says it was never claimed before it expired.
  if (resolution === "expired") {
    return (
      <p className="mt-3 text-xs font-semibold text-zinc-500">
        This proposal expired — nothing was changed.
      </p>
    );
  }

  if (resolution === "confirmed") {
    return (
      <p className="mt-3 text-xs font-semibold text-emerald-400">
        ✓ Done — {pendingConfirmation.summary.toLowerCase()}.
      </p>
    );
  }

  if (resolution === "cancelled") {
    return (
      <p className="mt-3 text-xs font-semibold text-zinc-500">
        Cancelled — nothing was changed.
      </p>
    );
  }

  if (resolution === "failed") {
    return (
      <p className="mt-3 text-xs font-semibold text-rose-400">
        That couldn&apos;t be saved. Nothing was changed.
      </p>
    );
  }

  // The request may have reached the server before the connection failed: never claim "nothing changed" here.
  if (resolution === "unknown") {
    return (
      <p className="mt-3 text-xs font-semibold text-amber-400">
        We couldn&apos;t confirm the result. Check your log before trying again — it may already be saved.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
      <span className="mr-2 text-xs text-zinc-300">{pendingConfirmation.summary}</span>

      <button
        type="button"
        disabled={isBusy}
        onClick={onConfirm}
        className="min-h-11 rounded-xl bg-mf-glass-brand px-4 text-sm font-semibold text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover disabled:opacity-50"
      >
        Confirm
      </button>

      <button
        type="button"
        disabled={isBusy}
        onClick={onCancel}
        className="min-h-11 rounded-xl border border-mf-glass-border px-4 text-sm font-semibold text-mf-glass-text-secondary transition hover:bg-white/5 disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}

/* =========================================================
   COMPONENT
========================================================= */

export default function DanteChat({
  welcomeMessage = DEFAULT_WELCOME_MESSAGE,
  heroTitle = "Dante",
  heroSubtitle,
  quickPrompts = QUICK_PROMPTS,
  contextualSuggestions,
  compact = false,
  className,
  contextPayload,
  restoreHistory = false,
  contextLine = null,
}: DanteChatProps = {}) {
  const emptyStatePrompts: QuickPrompt[] =
    contextualSuggestions && contextualSuggestions.length > 0
      ? contextualSuggestions.map((insight) => ({
          label: insight.action,
          prompt: insight.prompt ?? insight.action,
        }))
      : quickPrompts;
  const [messages, setMessages] =
    useState<ChatMessage[]>([
      {
        id: "welcome",
        role: "assistant",
        content: welcomeMessage,
      },
    ]);

  const [confirmingActionId, setConfirmingActionId] =
    useState<string | null>(null);

  const [input, setInput] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  // The conversation every turn is saved into; null until the first send (or a restore) picks one.
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [isRestoring, setIsRestoring] = useState(restoreHistory);
  // Once the user has sent something, a late restore must never replace that conversation.
  const sendStartedRef = useRef(false);

  const [activity, setActivity] = useState<DanteActivity>("idle");
  const visualState = useDantePresence(activity);
  // A conversation reopened from history: how many saved messages it brought back, and when the last one was written.
  const [restored, setRestored] = useState<{ count: number; asOf: string } | null>(null);

  const isEmpty = messages.length === 1;

  const abortControllerRef =
    useRef<AbortController | null>(null);

  const chatWindowRef =
    useRef<HTMLDivElement | null>(null);

  // Whether the viewport was already near the bottom the last time we
  // checked — true by default (a fresh conversation should follow
  // along), flipped to false the moment the user scrolls up on their
  // own, so a streaming reply never hijacks their scroll position.
  const shouldAutoScrollRef = useRef(true);

  const textareaRef =
    useRef<HTMLTextAreaElement | null>(null);

  /* =======================================================
     AUTO SCROLL — follows the stream only while the user is
     already near the bottom; never hijacks manual scroll-up.
  ======================================================= */

  const NEAR_BOTTOM_THRESHOLD_PX = 120;

  function handleChatWindowScroll() {
    const el = chatWindowRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
  }

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;

    // Scroll the chat window itself — scrollIntoView also scrolled the
    // page, pushing the selector and NEW CHAT under the mobile header.
    const el = chatWindowRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  /* =======================================================
     COMPOSER AUTO-GROW — grows with content up to a sensible
     maximum, then scrolls internally rather than pushing the rest
     of the layout around.
  ======================================================= */

  const COMPOSER_MAX_HEIGHT_PX = 160;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, [input]);

  /* =======================================================
     PENDING PROPOSALS — a Confirm/Cancel card is server state
     (dante_tool_actions), not chat state: after navigation or a
     refresh, still-valid proposals come back as actionable cards.
     Expired or handled ones are never restored (the server filters
     them, and confirm re-checks atomically).
  ======================================================= */

  function syncThreadUrl(id: string | null) {
    if (!restoreHistory || compact) return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("c", id);
    else url.searchParams.delete("c");
    window.history.replaceState(window.history.state, "", url);
  }

  async function refreshThreads() {
    const response = await fetch("/api/dante/conversations").catch(() => null);
    const data = response?.ok ? ((await response.json()) as { threads?: ThreadSummary[] }) : null;
    if (data?.threads) setThreads(data.threads);
    return data?.threads ?? [];
  }

  /** Loads a saved conversation from the server; false when it doesn't exist for this user. */
  async function openThread(id: string, isMountRestore = false): Promise<boolean> {
    const response = await fetch(`/api/dante/conversations?id=${encodeURIComponent(id)}`).catch(() => null);
    if (!response?.ok) return false;
    const data = (await response.json()) as { messages?: StoredDanteMessage[] };
    // Only the automatic mount restore yields to a send already in progress; a picked conversation always opens.
    if (isMountRestore && sendStartedRef.current) return true;
    const stored = data.messages ?? [];
    setMessages([{ id: "welcome", role: "assistant", content: welcomeMessage }, ...stored.map(fromStoredMessage)]);
    setRestored(stored.length > 0 ? { count: stored.length, asOf: stored[stored.length - 1].createdAt } : null);
    setThreadId(id);
    syncThreadUrl(id);
    if (restoreHistory) rememberThread(id);
    return true;
  }

  function startNewConversation() {
    abortControllerRef.current?.abort();
    setMessages([{ id: "welcome", role: "assistant", content: welcomeMessage }]);
    setRestored(null);
    setThreadId(null);
    syncThreadUrl(null);
    if (restoreHistory) rememberThread(null);
  }

  async function selectThread(id: string) {
    if (!id) return startNewConversation();
    setIsRestoring(true);
    if (!(await openThread(id))) startNewConversation();
    setIsRestoring(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!restoreHistory) return;
      const params = new URLSearchParams(window.location.search);
      const fromUrl = compact ? null : params.get("c");
      // ?ask= (a contextual "Ask Dante" link): a fresh conversation with the question drafted, never sent automatically.
      const ask = compact ? null : params.get("ask")?.trim().slice(0, 500) || null;
      if (ask) {
        const url = new URL(window.location.href);
        url.searchParams.delete("ask");
        window.history.replaceState(window.history.state, "", url);
        setInput(ask);
        rememberThread(null);
        await refreshThreads();
        return;
      }
      const list = await refreshThreads();
      // URL first, then the conversation this tab last had open ("" = it was on a new chat), then the most recent one.
      const remembered = readLastThread();
      const target = fromUrl ?? (remembered === null ? list[0]?.id ?? null : remembered || null);
      if (!cancelled && target && !sendStartedRef.current && !(await openThread(target, true))) syncThreadUrl(null);
    }
    void restore()
      .catch(() => {})
      .finally(() => !cancelled && setIsRestoring(false))
      .then(() => (cancelled ? null : fetch("/api/dante/tools/pending")))
      .then((response) => (response?.ok ? response.json() : null))
      .then((data: { pending?: Array<PendingConfirmation & { expiresAt: string }> } | null) => {
        const pending = data?.pending ?? [];
        if (cancelled || pending.length === 0) return;
        setMessages((current) => {
          const shown = new Set(current.map((message) => message.pendingConfirmation?.actionId).filter(Boolean));
          const restored = pending
            .filter((item) => !shown.has(item.actionId))
            .map((item): ChatMessage => ({
              id: `pending-${item.actionId}`,
              role: "assistant",
              content: "This is still waiting for you — nothing is saved until you tap Confirm.",
              pendingConfirmation: { actionId: item.actionId, toolName: item.toolName, summary: item.summary },
              confirmationResolution: null,
              isComplete: true,
            }));
          return restored.length ? [...current, ...restored] : current;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Mount-only: restore, then proposals still pending anywhere (deduped against the restored ones).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =======================================================
     FORM COACH HANDOFF — auto-send a session summary left by
     the Form Coach camera (see lib/form-coach/handoff.ts).
  ======================================================= */

  useEffect(() => {
    let summary: string | null = null;

    try {
      summary = window.sessionStorage.getItem(FORM_COACH_HANDOFF_KEY);

      if (summary) {
        window.sessionStorage.removeItem(FORM_COACH_HANDOFF_KEY);
      }
    } catch {
      summary = null;
    }

    if (summary) {
      void sendMessage(summary);
    }

    // Runs once on mount only — this is a one-time handoff read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =======================================================
     SEND MESSAGE
  ======================================================= */

  // Deliberately does NOT claim training/nutrition/recovery data are
  // "still available" — this fallback fires before this request knows
  // whether any of that context loaded successfully, so asserting it
  // did would be a false claim. What IS always true: a failed chat
  // turn never mutates logged data (that only happens via explicit
  // confirmed write tools), so this states that instead.
  const UNAVAILABLE_MESSAGE = DANTE_UNAVAILABLE_MESSAGE;

  function updateStreamingMessage(
    messageId: string,
    update: (message: ChatMessage) => ChatMessage
  ) {
    setMessages((previous) =>
      previous.map((message) =>
        message.id === messageId ? update(message) : message
      )
    );
  }

  /** `retry` resends an unfinished turn under its original id: the server reuses its rows (or replays a stored reply). */
  async function sendMessage(override?: string, retry?: { turnId: string; assistantId: string }) {
    const trimmed =
      (override ?? input).trim();

    if (
      !trimmed ||
      isLoading
    ) {
      return;
    }

    sendStartedRef.current = true;
    const activeThreadId = threadId ?? crypto.randomUUID();
    if (!threadId) {
      setThreadId(activeThreadId);
      syncThreadUrl(activeThreadId);
      if (restoreHistory) rememberThread(activeThreadId);
    }

    const turnId = retry?.turnId ?? crypto.randomUUID();
    const userMessage: ChatMessage = {
      id: turnId,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
      turnId,
    };

    const assistantId = retry?.assistantId ?? crypto.randomUUID();
    const streamingReply: ChatMessage = { id: assistantId, role: "assistant", content: "", isComplete: false, turnId };
    // History sent to the server: everything before this turn (a retried turn's own question is already in `messages`).
    const retryIndex = retry ? messages.findIndex((message) => message.turnId === retry.turnId) : -1;
    const priorMessages = retryIndex >= 0 ? messages.slice(0, retryIndex) : messages;

    setMessages((previous) =>
      retry
        ? previous.map((message) => (message.id === assistantId ? streamingReply : message))
        : [...previous, userMessage, streamingReply]
    );

    shouldAutoScrollRef.current = true;

    setInput("");
    setIsLoading(true);
    setActivity("thinking");
    window.dispatchEvent(new Event(COACH_TURN_STARTED_EVENT));

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(
        "/api/chatbot",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              message:
                trimmed,
              // Recent user turns only — the server selects a bounded context
              // working set from them (H0 cluster A); never dumped into a prompt.
              messages: [
                ...priorMessages
                  .filter((entry) => entry.role === "user" && entry.content.trim())
                  .map((entry) => ({
                    role: "user" as const,
                    content: entry.content.trim(),
                    ...(entry.createdAt ? { createdAt: entry.createdAt } : {}),
                  })),
                {
                  role: "user" as const,
                  content: trimmed,
                  createdAt: userMessage.createdAt,
                },
              ].slice(-20),
              ...contextPayload,
              threadId: activeThreadId,
              clientMessageId: turnId,
            }),

          signal:
            controller.signal,
        }
      );

      if (!response.ok || !response.body) {
        const retryAfterHeader = Number(response.headers.get("Retry-After"));
        const payload = await response.json().catch(() => null) as
          | { retryAfterSeconds?: unknown }
          | null;
        const retryAfterSeconds =
          typeof payload?.retryAfterSeconds === "number"
            ? payload.retryAfterSeconds
            : retryAfterHeader;
        throw new Error(danteHttpFailureCopy(response.status, retryAfterSeconds));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let remainder = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const parsed = parseChatStreamChunk(remainder, chunk);
        remainder = parsed.remainder;

        // One setMessages call per network chunk (not per line, and
        // never per character) — batches naturally with however the provider
        // itself chunked the response, instead of one rerender per token.
        let appendedText = "";
        let doneEvent: Extract<ChatStreamEvent, { type: "done" }> | null = null;
        let errorEvent: Extract<ChatStreamEvent, { type: "error" }> | null = null;
        let savedEvent: Extract<ChatStreamEvent, { type: "saved" }> | null = null;

        for (const event of parsed.events) {
          if (event.type === "delta") {
            appendedText += event.text;
          } else if (event.type === "done") {
            doneEvent = event;
          } else if (event.type === "error") {
            errorEvent = event;
          } else if (event.type === "saved") {
            savedEvent = event;
          }
        }

        if (appendedText) {
          updateStreamingMessage(assistantId, (message) => ({
            ...message,
            content: message.content + appendedText,
          }));
        }

        if (doneEvent) {
          const finalEvent = doneEvent;

          updateStreamingMessage(assistantId, (message) => {
            // QA-08: a finished reply with no text and nothing to confirm would render as a silent blank — say so instead
            // (same copy as any failed turn) and offer Retry.
            const empty = message.content.trim().length === 0 && !finalEvent.pendingConfirmation;
            return {
              ...message,
              content: empty ? UNAVAILABLE_MESSAGE : message.content,
              insight: finalEvent.insight,
              sources: Array.isArray(finalEvent.sources) ? finalEvent.sources : [],
              // A pending confirmation is only ever attached here, from
              // the server's own completed `done` event — never
              // rendered speculatively while text is still streaming.
              pendingConfirmation: finalEvent.pendingConfirmation,
              confirmationResolution: null,
              isComplete: true,
              ...(empty ? { historyStatus: "error" as const } : {}),
            };
          });

          setActivity("success");
        }

        if (errorEvent) {
          const finalError = errorEvent;

          updateStreamingMessage(assistantId, (message) => ({
            ...message,
            content: resolveStreamErrorContent(message.content, finalError.partial, UNAVAILABLE_MESSAGE),
            isComplete: true,
            historyStatus: "error",
          }));

          setActivity("error");
        }

        if (savedEvent && !savedEvent.ok) {
          updateStreamingMessage(assistantId, (message) => ({ ...message, notSaved: true }));
        }
      }
    } catch (error: unknown) {
      const wasAborted =
        error instanceof DOMException && error.name === "AbortError";

      console.error(
        "[DANTE FRONTEND ERROR]",
        error
      );

      setActivity(wasAborted ? "idle" : "error");
      // The message stays in the conversation; retrying is the reply's own Retry button (same turn id, never
      // auto-resent) — refilling the composer would send it again as a second, duplicate turn.

      /*
       * Reassuring, non-technical failure state (spec: "Failure
       * State"). Never crash the page and never leave the user
       * thinking their own data was affected — provider failure has no
       * bearing on training/nutrition/recovery data, which all lives
       * in Supabase, not in this request. Technical detail still goes
       * to the console above for debugging. An abort keeps whatever
       * text already streamed in rather than replacing it.
       */
      const failureCopy =
        error instanceof Error &&
        (error.message === DANTE_SESSION_EXPIRED_MESSAGE ||
          isDanteRateLimitedMessage(error.message))
          ? error.message
          : UNAVAILABLE_MESSAGE;

      updateStreamingMessage(assistantId, (message) => ({
        ...message,
        content: wasAborted
          ? resolveAbortedContent(message.content)
          : message.content || failureCopy,
        isComplete: true,
        wasAborted,
        historyStatus: wasAborted ? "interrupted" : "error",
      }));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      if (restoreHistory) void refreshThreads();
      // A turn may have published or withdrawn a disclosure (allergy, low intake): surfaces derived from it re-fetch.
      window.dispatchEvent(new Event(COACH_CONTEXT_CHANGED_EVENT));
    }
  }

  function stopStreaming() {
    abortControllerRef.current?.abort();
  }

  /* =======================================================
     CONFIRM / CANCEL a pending Dante action (Part 7). Real buttons,
     real fetch — success is only ever reported after the server
     confirms the write actually persisted.
  ======================================================= */

  async function handleConfirmAction(
    messageId: string,
    actionId: string,
    intent: "confirm" | "cancel"
  ) {
    setConfirmingActionId(actionId);

    try {
      const response = await fetch("/api/dante/tools/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, intent }),
      });

      const data = (await response.json().catch(() => ({}))) as { ok?: boolean };

      const resolution = resolveConfirmationOutcome(intent, { status: response.status, ok: data.ok });

      setMessages((previous) =>
        previous.map((message) =>
          message.id === messageId
            ? { ...message, confirmationResolution: resolution }
            : message
        )
      );
    } catch (error) {
      console.error("[DANTE CONFIRM ACTION ERROR]", error);

      setMessages((previous) =>
        previous.map((message) =>
          message.id === messageId
            ? { ...message, confirmationResolution: "unknown" }
            : message
        )
      );
    } finally {
      setConfirmingActionId(null);
    }
  }

  /* =======================================================
     FORM
  ======================================================= */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    await sendMessage();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      void sendMessage();
    }

    // Shift+Enter falls through to the textarea's own default
    // behavior — a real newline — preserving the existing intended UX.
  }

  function handleInputFocus() {
    if (!isLoading) {
      setActivity("listening");
    }
  }

  function handleInputBlur() {
    if (!isLoading) {
      setActivity("idle");
    }
  }

  function handleQuickPrompt(prompt: string) {
    void sendMessage(prompt);
  }

  /* =======================================================
     UI — conversation first: a slim header, the messages, the composer.
  ======================================================= */

  const welcome = messages[0];
  const conversation = messages.slice(1);

  return (
    <section
      aria-label={heroTitle}
      className={cn(
        // isolate: keeps the chat's internal z-layers from painting over the dashboard header.
        // mf-touch-inputs: the composer and conversation picker stay 16px on phones (no zoom on focus).
        "relative isolate flex w-full flex-col font-sans overflow-hidden rounded-[20px] border border-mf-glass-border bg-mf-glass-surface mf-touch-inputs",
        compact
          ? "h-[min(65dvh,560px)] max-h-[min(65dvh,560px)] min-h-[420px]"
          // Below lg: fit between the shell header (4rem), the page's top padding (1.25rem)
          // and the bottom nav (4.5rem, as the workout bar) so the composer is never under the nav.
          : "max-lg:h-[calc(100dvh-9.75rem-env(safe-area-inset-bottom,0px))] max-lg:min-h-[360px] lg:h-[min(82dvh,860px)] lg:min-h-[580px]",
        className
      )}
    >
      <span aria-live="polite" className="sr-only">
        {DANTE_STATE_LABEL[visualState]}
      </span>

      {/* HEADER — who you're talking to, and (full page) which conversation. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-mf-glass-border px-3 py-2 sm:px-4">
        <DanteMonogram />
        <span className={cn("text-sm font-bold text-mf-glass-text", restoreHistory && "max-sm:sr-only")}>Dante</span>

        {restoreHistory ? (
          <>
            <select
              aria-label="Dante conversations"
              value={threadId ?? ""}
              disabled={isLoading || isRestoring}
              onChange={(event) => void selectThread(event.target.value)}
              className="h-11 min-w-0 flex-1 truncate rounded-xl border border-mf-glass-border bg-mf-glass-bg-deep px-3 text-sm text-mf-glass-text-secondary disabled:opacity-50"
            >
              <option value="">{isRestoring ? "Loading conversations…" : "New conversation"}</option>
              {threads.map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {thread.title} · {new Date(thread.updatedAt).toLocaleDateString()}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={startNewConversation}
              disabled={isLoading || isRestoring || threadId === null}
              className="h-11 shrink-0 rounded-xl border border-mf-glass-border px-3 text-sm font-semibold text-mf-glass-text-secondary transition hover:bg-white/5 disabled:opacity-40"
            >
              New chat
            </button>
          </>
        ) : null}
      </header>

      {contextLine ? (
        <p className="shrink-0 border-b border-mf-glass-border px-3 py-2 text-xs leading-5 text-mf-glass-text-muted sm:px-4">
          <span className="font-semibold text-mf-glass-text-secondary">Your data now</span> · {contextLine}
        </p>
      ) : null}

      {/* CONVERSATION */}
      <div
        ref={chatWindowRef}
        onScroll={handleChatWindowScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5"
      >
        <div className="mx-auto max-w-3xl space-y-5">
          <AssistantText content={welcome.content} />

          {isEmpty ? (
            <div className="space-y-3">
              {heroSubtitle ? <p className="text-sm leading-6 text-mf-glass-text-muted">{heroSubtitle}</p> : null}
              {emptyStatePrompts.length > 0 ? (
                <ul className="space-y-2" aria-label="Suggested questions">
                  {emptyStatePrompts.slice(0, 4).map((item) => (
                    <li key={item.label}>
                      <button
                        type="button"
                        onClick={() => handleQuickPrompt(item.prompt)}
                        disabled={isLoading}
                        className="flex min-h-11 w-full items-center rounded-xl border border-mf-glass-border px-3.5 py-2 text-left text-sm text-mf-glass-text-secondary transition hover:border-mf-glass-dante/40 hover:text-mf-glass-text disabled:opacity-40"
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {conversation.map((message, index) => {
            const isUser = message.role === "user";
            // One marker where the reopened history ends: replies above it describe the data as it was then.
            const earlierBoundary = restored && index === restored.count - 1;

            return (
              <React.Fragment key={message.id}>
                <div className={cn("dante-message-in flex w-full", isUser ? "justify-end" : "justify-start")}>
                  {isUser ? (
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.07] px-4 py-2.5 text-[15px] leading-relaxed text-mf-glass-text sm:max-w-[75%]">
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  ) : (
                    <div className="flex w-full min-w-0 flex-col gap-2">
                      {message.content.length === 0 && !message.isComplete ? (
                        <p aria-live="polite" className="flex items-center gap-2 py-1 text-sm text-mf-glass-text-muted">
                          <span className="flex gap-1" aria-hidden="true">
                            <span className="size-1.5 rounded-full bg-mf-glass-dante motion-safe:animate-pulse" />
                            <span className="size-1.5 rounded-full bg-mf-glass-dante motion-safe:animate-pulse [animation-delay:150ms]" />
                            <span className="size-1.5 rounded-full bg-mf-glass-dante motion-safe:animate-pulse [animation-delay:300ms]" />
                          </span>
                          Dante is thinking…
                        </p>
                      ) : (
                        <AssistantText content={message.content} />
                      )}

                      {message.historyStatus === "pending" || message.historyStatus === "interrupted" ? (
                        <p className="text-xs font-semibold text-amber-400">
                          {message.historyStatus === "pending"
                            ? "This reply was never confirmed as finished — it may have been cut off by a refresh or lost connection."
                            : "This reply was interrupted before Dante finished."}
                        </p>
                      ) : null}

                      {message.notSaved ? (
                        <p className="text-xs font-semibold text-amber-400">
                          This reply couldn&apos;t be saved to your conversation history.
                        </p>
                      ) : null}

                      {message.historyStatus && message.turnId && !isLoading ? (
                        <button
                          type="button"
                          onClick={() => {
                            const question = messages.find((entry) => entry.role === "user" && entry.turnId === message.turnId);
                            if (question) void sendMessage(question.content, { turnId: message.turnId!, assistantId: message.id });
                          }}
                          className="min-h-11 self-start rounded-xl border border-mf-glass-border px-4 text-sm font-semibold text-mf-glass-text-secondary transition hover:bg-white/5"
                        >
                          Retry
                        </button>
                      ) : null}

                      {message.insight ? <DanteInsightPanel insight={message.insight} /> : null}

                      {message.sources && message.sources.length > 0 ? <DanteSourcesPanel sources={message.sources} /> : null}

                      {message.pendingConfirmation ? (
                        <PendingConfirmationPanel
                          pendingConfirmation={message.pendingConfirmation}
                          resolution={message.confirmationResolution}
                          isBusy={confirmingActionId === message.pendingConfirmation.actionId}
                          onConfirm={() => void handleConfirmAction(message.id, message.pendingConfirmation!.actionId, "confirm")}
                          onCancel={() => void handleConfirmAction(message.id, message.pendingConfirmation!.actionId, "cancel")}
                        />
                      ) : null}
                    </div>
                  )}
                </div>

                {earlierBoundary ? (
                  <p role="note" className="flex items-center gap-3 text-xs font-semibold text-mf-glass-text-muted">
                    <span className="h-px flex-1 bg-mf-glass-border" aria-hidden="true" />
                    <span className="text-center">Earlier conversation · figures above were current {formatAsOf(restored.asOf)}</span>
                    <span className="h-px flex-1 bg-mf-glass-border" aria-hidden="true" />
                  </p>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* COMPOSER */}
      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-end gap-2 border-t border-mf-glass-border px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-4"
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          disabled={isLoading}
          aria-label="Message to Dante"
          placeholder="Ask Dante…"
          className="max-h-40 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-mf-glass-border bg-mf-glass-bg-deep px-3.5 py-2.5 text-base leading-6 text-mf-glass-text placeholder:text-mf-glass-text-muted focus-visible:border-mf-glass-dante/60 disabled:cursor-not-allowed disabled:opacity-60"
        />

        {isLoading ? (
          <button
            type="button"
            onClick={stopStreaming}
            aria-label="Stop Dante's response"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-rose-500/40 text-rose-300 transition hover:bg-rose-500/10"
          >
            <span className="size-3 rounded-[2px] bg-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send message to Dante"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-mf-glass-brand text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </form>
    </section>
  );
}

/** Dante's small mark: a monogram, never an illustration. */
function DanteMonogram() {
  return (
    <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-lg border border-mf-glass-dante/35 bg-mf-glass-dante/10 text-xs font-black text-mf-glass-dante">
      D
    </span>
  );
}

const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  p: ({ children }) => <p className="mb-3 text-[15px] leading-relaxed text-mf-glass-text last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-3 mt-2 text-lg font-bold text-mf-glass-text">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-bold text-mf-glass-text">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-3 text-[15px] font-semibold text-mf-glass-text">{children}</h3>,
  strong: ({ children }) => <strong className="font-semibold text-mf-glass-text">{children}</strong>,
  ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1 marker:text-mf-glass-text-muted">{children}</ul>,
  // `start` must pass through: a list interrupted by a paragraph or heading continues as <ol start="n">.
  ol: ({ children, start }) => <ol start={start} className="mb-3 ml-5 list-decimal space-y-1 marker:text-mf-glass-text-muted">{children}</ol>,
  li: ({ children }) => <li className="pl-1 text-[15px] leading-relaxed text-mf-glass-text">{children}</li>,
  br: () => <br className="block content-['']" />,
  table: ({ children }) => (
    <div className="my-3 w-full overflow-x-auto rounded-xl border border-mf-glass-border">
      <table className="w-full min-w-120 border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/[0.04] text-mf-glass-text-secondary">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-mf-glass-border">{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top text-mf-glass-text">{children}</td>,
  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-mf-glass-dante/50 pl-3 text-mf-glass-text-secondary">{children}</blockquote>,
  code: ({ children }) => <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[13px] text-mf-glass-text">{children}</code>,
  pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-xl bg-black/35 p-3 font-mono text-[13px] leading-5">{children}</pre>,
  hr: () => <hr className="my-4 border-mf-glass-border" />,
};

/** A Dante reply as plain reading text (sanitized markdown), not a card. */
function AssistantText({ content }: { content: string }) {
  return (
    <div className="min-w-0 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]} components={MARKDOWN_COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
