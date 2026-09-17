"use client";

import {
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

import { DanteRobot } from "@/components/dante/dante-robot";
import hudStyles from "@/components/dante/holographic-telemetry-pod.module.css";
import {
  DANTE_STATE_LABEL,
  useDantePresence,
  type DanteActivity,
} from "@/components/dante/dante-presence";
import { cn } from "@/lib/utils";
import { FORM_COACH_HANDOFF_KEY } from "@/lib/form-coach/handoff";
import type { DanteInsight } from "@/lib/dante-core/insight";
import {
  parseChatStreamChunk,
  resolveAbortedContent,
  resolveStreamErrorContent,
  type ChatStreamEvent,
  type ChatStreamSource,
} from "@/lib/dante-core/chat-stream-protocol";

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
  insight?: DanteInsight | null;
  sources?: ChatStreamSource[] | null;
  pendingConfirmation?: PendingConfirmation | null;
  confirmationResolution?: "confirmed" | "cancelled" | "failed" | null;
  isComplete?: boolean;
  wasAborted?: boolean;
};

export type QuickPrompt = {
  tag?: string;
  label: string;
  prompt: string;
};

const QUICK_PROMPTS: QuickPrompt[] = [
  {
    tag: "// TELEMETRY: SẴN SÀNG 87%",
    label: "Hôm nay tôi nên tập gì?",
    prompt: "Dựa vào chỉ số sẵn sàng 87%, hôm nay tôi nên tập bài gì?",
  },
  {
    tag: "// DINH DƯỠNG: MỤC TIÊU 140g",
    label: "Tôi có thể ăn gì để đạt mục tiêu protein?",
    prompt: "Bạn có gợi ý dinh dưỡng nào để giúp tôi đạt mục tiêu 140g protein còn lại không?",
  },
  {
    tag: "// HỆ THỐNG: CHƯA KIỂM TRA",
    label: "Bạn chưa kiểm tra hôm nay.",
    prompt: "Tôi cần thực hiện kiểm tra phục hồi hàng ngày.",
  },
  {
    tag: "// PHÂN TÍCH: CHU KỲ 30 NGÀY",
    label: "Tôi tiến bộ thế nào trong tháng này?",
    prompt: "Tiến độ của tôi trong chu kỳ tập luyện và phục hồi 30 ngày qua như thế nào?",
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
   * on pages with no per-user signal (e.g. the public /chatbot page)
   * to fall back to the generic starters.
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
};

const DEFAULT_WELCOME_MESSAGE =
  "Hi. I'm **Dante**, your Muscle Fitness intelligence coach. Ask me about your training, nutrition, recovery or progress.";

const DEFAULT_HERO_SUBTITLE =
  "I understand your training profile, nutrition targets and current plan. Ask me about your training, nutrition, recovery or progress.";

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
    <div className="mt-4 border-t border-white/8 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {insight.nextAction ? (
          <Link
            href={insight.nextAction.href}
            className="inline-flex h-9 items-center rounded-xl bg-amber-400 px-4 text-xs font-black uppercase tracking-[0.06em] text-black transition hover:bg-amber-300"
          >
            {insight.nextAction.label}
          </Link>
        ) : null}

        {hasWhy ? (
          <details className="group">
            <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-white/10 px-4 text-xs font-black uppercase tracking-[0.06em] text-zinc-400 transition hover:bg-white/[0.06]">
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
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-600">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-white">{item.value}</p>
                      {item.note ? (
                        <p className="mt-0.5 text-[11px] text-zinc-500">{item.note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {insight.confidence ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-600">
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
    <div className="mt-4 border-t border-white/8 pt-4">
      <details className="group">
        <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-white/10 px-4 text-xs font-black uppercase tracking-[0.06em] text-zinc-400 transition hover:bg-white/[0.06]">
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
                <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-600">
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
  resolution: "confirmed" | "cancelled" | "failed" | null | undefined;
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
      <span className="mr-2 text-xs text-zinc-300">{pendingConfirmation.summary}</span>

      <button
        type="button"
        disabled={isBusy}
        onClick={onConfirm}
        className="rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-black transition hover:bg-amber-300 disabled:opacity-50"
      >
        Confirm
      </button>

      <button
        type="button"
        disabled={isBusy}
        onClick={onCancel}
        className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
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
  heroTitle = "Your AI Performance Coach",
  heroSubtitle = DEFAULT_HERO_SUBTITLE,
  quickPrompts = QUICK_PROMPTS,
  contextualSuggestions,
  compact = false,
  className,
  contextPayload,
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

  const [activity, setActivity] = useState<DanteActivity>("idle");
  const [hoveredPromptIndex, setHoveredPromptIndex] = useState<number | null>(null);
  const visualState = useDantePresence(activity);

  const isEmpty = messages.length === 1;

  const messagesEndRef =
    useRef<HTMLDivElement | null>(
      null
    );

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

    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
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
  const UNAVAILABLE_MESSAGE =
    "Dante couldn't complete that response.\n\nYour logged data has not been changed.";

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

  async function sendMessage(override?: string) {
    const trimmed =
      (override ?? input).trim();

    if (
      !trimmed ||
      isLoading
    ) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    const assistantId = crypto.randomUUID();

    setMessages((previous) => [
      ...previous,
      userMessage,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        isComplete: false,
      },
    ]);

    shouldAutoScrollRef.current = true;

    setInput("");
    setIsLoading(true);
    setActivity("thinking");

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
              // Recent user turns only — powers Phase 2D gradual
              // communication adaptation without dumping full transcripts.
              messages: [
                ...messages
                  .filter((entry) => entry.role === "user" && entry.content.trim())
                  .map((entry) => ({
                    role: "user" as const,
                    content: entry.content.trim(),
                  })),
                { role: "user" as const, content: trimmed },
              ].slice(-8),
              ...contextPayload,
            }),

          signal:
            controller.signal,
        }
      );

      if (!response.ok || !response.body) {
        let serverError: string | undefined;

        try {
          const errorBody = (await response.json()) as { error?: string };
          serverError = errorBody.error;
        } catch {
          // Body wasn't JSON (or the stream already started) — fall back to a generic message below.
        }

        throw new Error(
          serverError ?? `Request failed with status ${response.status}.`
        );
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
        // never per character) — batches naturally with however Groq
        // itself chunked the response, instead of one rerender per token.
        let appendedText = "";
        let doneEvent: Extract<ChatStreamEvent, { type: "done" }> | null = null;
        let errorEvent: Extract<ChatStreamEvent, { type: "error" }> | null = null;

        for (const event of parsed.events) {
          if (event.type === "delta") {
            appendedText += event.text;
          } else if (event.type === "done") {
            doneEvent = event;
          } else if (event.type === "error") {
            errorEvent = event;
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

          updateStreamingMessage(assistantId, (message) => ({
            ...message,
            insight: finalEvent.insight,
            sources: Array.isArray(finalEvent.sources) ? finalEvent.sources : [],
            // A pending confirmation is only ever attached here, from
            // the server's own completed `done` event — never
            // rendered speculatively while text is still streaming.
            pendingConfirmation: finalEvent.pendingConfirmation,
            confirmationResolution: null,
            isComplete: true,
          }));

          setActivity("success");
        }

        if (errorEvent) {
          const finalError = errorEvent;

          updateStreamingMessage(assistantId, (message) => ({
            ...message,
            content: resolveStreamErrorContent(message.content, finalError.partial, UNAVAILABLE_MESSAGE),
            isComplete: true,
          }));

          setActivity("error");
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

      /*
       * Reassuring, non-technical failure state (spec: "Failure
       * State"). Never crash the page and never leave the user
       * thinking their own data was affected — Groq failing has no
       * bearing on training/nutrition/recovery data, which all lives
       * in Supabase, not in this request. Technical detail still goes
       * to the console above for debugging. An abort keeps whatever
       * text already streamed in rather than replacing it.
       */
      updateStreamingMessage(assistantId, (message) => ({
        ...message,
        content: wasAborted
          ? resolveAbortedContent(message.content)
          : message.content || UNAVAILABLE_MESSAGE,
        isComplete: true,
        wasAborted,
      }));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
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

      const data = (await response.json()) as { ok?: boolean };

      const resolution: "confirmed" | "cancelled" | "failed" =
        intent === "cancel"
          ? "cancelled"
          : data.ok
          ? "confirmed"
          : "failed";

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
            ? { ...message, confirmationResolution: "failed" }
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
     UI
  ======================================================= */

  return (
    <div
      className={cn(
        // Normal-flow flex column: every child below is a sibling in
        // document flow (status bar → empty-state hero → conversation →
        // composer). The conversation pane is the ONLY flex-1 child, and
        // it carries min-h-0 so it actually shrinks to the container's
        // fixed height instead of growing to fit its content and pushing
        // the composer out of view.
        //
        // The fixed height (and its min-h floor) only applies once
        // there's a real scrollable conversation to bound (isEmpty
        // === false). The empty state (hero + composer, no message
        // history yet) carries no height/min-height at all — it's a
        // compact intro card, not a conversation pane, so it sizes to
        // its own (intentionally small) content instead of being
        // forced up to the conversation view's floor, which used to
        // leave the card taller than its content needed and made it
        // dominate the page above Recovery Knowledge Hub.
        "flex w-full min-h-0 flex-col font-sans",
        !isEmpty &&
          (compact
            ? "h-[min(62dvh,520px)] max-h-[min(62dvh,520px)] min-h-0"
            : "h-[min(74vh,820px)] min-h-125"),
        className,
      )}
    >

      {/* ===================================================
          DANTE STATUS BAR — active conversation only
      =================================================== */}

      {!isEmpty && (
        <div
          className="
            mb-4
            flex
            shrink-0
            items-center
            justify-between
            gap-3
            rounded-[20px]
            border
            border-white/10
            bg-[#12151c]
            px-5
            py-3.5
          "
        >
          <div className="flex items-center gap-3">
            <DanteRobot
              state={visualState}
              size="sm"
              interactive
            />

            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-mf-violet">
                Dante
              </p>

              <p className="text-sm font-medium text-white/55">
                Performance Intelligence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">
            <span
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                visualState === "error"
                  ? "bg-rose-400"
                  : visualState === "idle"
                    ? "bg-emerald-400"
                    : "bg-[var(--mf-violet)]",
              )}
            />

            {visualState === "idle" ? "Ready" : visualState}
          </div>
        </div>
      )}

      {/* Active Context Evidence Bar */}
      {!isEmpty && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
          <span className="flex items-center gap-1.5 text-[var(--mf-violet)]">
            <span className="size-1.5 rounded-full bg-[var(--mf-violet)]" />
            Active Context:
          </span>
          <span className="truncate text-zinc-400">
            Training • Recovery • Nutrition • Personal Baseline
          </span>
        </div>
      )}

      <span
        aria-live="polite"
        className="sr-only"
      >
        {DANTE_STATE_LABEL[visualState]}
      </span>

      {/* ===================================================
          EMPTY STATE — DANTE INTRODUCTION
      =================================================== */}

      {isEmpty && (
        <div className={`mb-4 flex shrink-0 flex-col items-center justify-between rounded-[24px] relative overflow-hidden p-5 sm:p-6 text-center ${hudStyles.obsidianCanvas} ${hudStyles.specularGlass}`}>
          {/* Ambient Lighting Washes */}
          <div aria-hidden="true" className={`absolute inset-0 pointer-events-none ${hudStyles.topLimeWash}`} />
          <div aria-hidden="true" className={`absolute inset-0 pointer-events-none ${hudStyles.bottomVioletWash}`} />

          {/* DANTE LIVING NUCLEUS & PROJECTION CHAMBER */}
          <div className="relative z-20 my-2 flex flex-col items-center justify-center">
            {/* Volumetric Cone Light */}
            <div aria-hidden="true" className={`absolute top-2 w-[140px] h-[110px] pointer-events-none ${hudStyles.volumetricCone}`} />

            <div className="relative flex items-center justify-center p-6">
              {/* Elliptical Floor Reflection Sheen */}
              <div aria-hidden="true" className={`absolute bottom-1.5 w-[110px] h-[18px] rounded-full pointer-events-none ${hudStyles.floorSheen}`} />

              {/* Concentric SVG Dashed Orbit Rings */}
              <svg
                viewBox="-90 -90 180 180"
                className="absolute inset-0 size-full overflow-visible pointer-events-none"
                aria-hidden="true"
              >
                <ellipse
                  rx="76"
                  ry="38"
                  fill="none"
                  stroke="rgba(212, 255, 0, 0.28)"
                  strokeWidth="1"
                  strokeDasharray="4 8"
                  transform="rotate(-12)"
                  className={hudStyles.orbitRingCW}
                />
                <ellipse
                  rx="62"
                  ry="30"
                  fill="none"
                  stroke="rgba(212, 255, 0, 0.18)"
                  strokeWidth="1"
                  strokeDasharray="2 6"
                  transform="rotate(18)"
                  className={hudStyles.orbitRingCCW}
                />
              </svg>

              {/* Vertical Laser Scanline Beam & Mascot Elevation */}
              <div className="relative z-10 overflow-hidden py-1">
                <div className={`absolute left-0 right-0 z-20 pointer-events-none ${hudStyles.scanlineBeam}`} />
                <div className={hudStyles.mascotFloat}>
                  <DanteRobot
                    state={visualState}
                    size="sm"
                    interactive
                  />
                </div>
              </div>
            </div>

            <p className="font-mono text-[9.5px] font-black uppercase tracking-[0.24em] text-[#D4FF00]">
              DANTE BIOMETRIC HUD • ONLINE
            </p>

            <h2 className="mt-1 text-xl font-bold tracking-tight text-white md:text-2xl">
              {heroTitle}
            </h2>
          </div>

          {/* DYNAMIC ORBIT SATELLITE SYSTEM (4 PROMPTS) */}
          <div className="relative z-20 mt-3 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
            {emptyStatePrompts.slice(0, 4).map((item, index) => {
              const driftClasses = [
                hudStyles.satelliteDriftA,
                hudStyles.satelliteDriftB,
                hudStyles.satelliteDriftC,
                hudStyles.satelliteDriftD,
              ];
              const driftClass = driftClasses[index % 4];
              const isHovered = hoveredPromptIndex === index;
              const isAnyHovered = hoveredPromptIndex !== null;
              const opacityClass = isAnyHovered && !isHovered ? "opacity-45 scale-[0.98]" : "opacity-100";

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleQuickPrompt(item.prompt)}
                  onPointerEnter={() => setHoveredPromptIndex(index)}
                  onPointerLeave={() => setHoveredPromptIndex(null)}
                  disabled={isLoading}
                  className={`relative px-4 py-3 text-left transition ${hudStyles.hudCard} ${driftClass} ${opacityClass} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <p className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-[#D4FF00]/90 mb-1">
                    {item.tag ?? `// TELEMETRY: PROMPT 0${index + 1}`}
                  </p>
                  <p className="text-xs font-semibold leading-5 text-zinc-100">
                    {item.label}
                  </p>
                </button>
              );
            })}
          </div>

          {/* ENERGY FILAMENT SVG CONDUIT (Connecting Dante to Input Bar) */}
          <svg
            viewBox="0 0 400 160"
            className="absolute inset-0 size-full pointer-events-none overflow-visible z-10"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="filamentGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#D4FF00" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#D4FF00" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            <path
              d="M 200 90 C 200 115, 200 135, 200 160"
              stroke="url(#filamentGradient)"
              strokeWidth={input.trim() ? 2.5 : 1.2}
              className={input.trim() ? hudStyles.filamentLineActive : hudStyles.filamentLine}
              fill="none"
              strokeDasharray="4 4"
            />
            <circle r={input.trim() ? 3.5 : 2.5} fill="#D4FF00">
              <animateMotion
                path="M 200 90 C 200 115, 200 135, 200 160"
                dur="2.5s"
                repeatCount="indefinite"
              />
            </circle>
            {/* Impact Sparkle Burst at Touchdown Point */}
            <circle cx="200" cy="160" r="4" fill="#D4FF00" filter="drop-shadow(0 0 10px #D4FF00)" />
            <circle cx="200" cy="160" r="9" fill="none" stroke="#D4FF00" strokeWidth="1" className="animate-ping opacity-60" />
          </svg>
        </div>
      )}

      {/* ===================================================
          CHAT WINDOW — only once there's a real conversation beyond
          the seeded welcome message. In the empty state the hero
          block above already covers this space (same welcome copy,
          via heroTitle/heroSubtitle); rendering this too produced a
          second, near-empty rounded surface directly under it, since
          a flex-1 min-h-0 pane squeezed toward zero height still paints
          its own border/padding.
      =================================================== */}

      {!isEmpty && (
      <div
        ref={chatWindowRef}
        onScroll={handleChatWindowScroll}
        className="
          min-h-0
          flex-1
          overflow-y-auto
          rounded-[24px]
          border
          border-white/10
          bg-[#151922]
          px-4
          py-6
          shadow-2xl
          shadow-black/30
          md:px-7
        "
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">

          {messages.map(
            (message) => {
              const isUser =
                message.role ===
                "user";

              return (
                <div
                  key={message.id}
                  className={cn(
                    "dante-message-in",
                    isUser ? "flex justify-end" : "flex justify-start",
                  )}
                >

                  {/* =======================================
                      USER MESSAGE
                  ======================================= */}

                  {isUser ? (
                    <div
                      className="
                        max-w-[80%]
                        rounded-3xl
                        rounded-br-md
                        bg-mf-surface
                        border
                        border-white/10
                        px-5
                        py-3.5
                        text-base
                        font-medium
                        leading-7
                        text-white
                        shadow-lg
                        shadow-black/10
                        md:max-w-[70%]
                      "
                    >
                      <p className="whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                  ) : (

                    /* =====================================
                       DANTE MESSAGE
                    ===================================== */

                    <div className="flex w-full max-w-[92%] items-start gap-3 md:max-w-[86%]">

                      {/* AVATAR */}

                      <div
                        className="
                          mt-1
                          hidden
                          h-9
                          w-9
                          shrink-0
                          items-center
                          justify-center
                          rounded-xl
                          border
                          border-[var(--mf-violet)]/30
                          bg-[var(--mf-violet)]/10
                          text-sm
                          font-bold
                          text-[var(--mf-violet)]
                          sm:flex
                        "
                      >
                        D
                      </div>

                      {/* MESSAGE BODY */}

                      <div
                        className="
                          w-full
                          overflow-hidden
                          rounded-3xl
                          rounded-tl-md
                          border
                          border-white/8
                          bg-mf-surface-elevated
                          px-5
                          py-4
                          text-base
                          font-normal
                          leading-7
                          text-[#edf0f5]
                          md:px-6
                        "
                      >

                        {/* DANTE LABEL */}

                        <div className="mb-4 flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--mf-violet)]">
                            Dante
                          </span>

                          <span className="h-1 w-1 rounded-full bg-white/25" />

                          <span className="text-xs text-white/35">
                            Intelligence Coach
                          </span>
                        </div>

                        {/* =================================
                            MARKDOWN — while this specific message
                            has no text yet (the very start of a
                            stream), show a subtle "thinking" state
                            in its place instead of an empty bubble.
                            Once the first delta lands, the growing
                            answer itself becomes the loading
                            feedback (no separate indicator).
                        ================================= */}

                        {message.content.length === 0 && !message.isComplete ? (
                          <div
                            aria-live="polite"
                            className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--mf-violet)]"
                          >
                            Dante is thinking…
                          </div>
                        ) : (
                        <ReactMarkdown
                          remarkPlugins={[
                            remarkGfm,
                          ]}
                          rehypePlugins={[
                            rehypeRaw,
                            rehypeSanitize,
                          ]}
                          components={{

                            /* =============================
                               PARAGRAPH
                            ============================= */

                            p({
                              children,
                            }) {
                              return (
                                <p className="mb-4 leading-7 text-[#edf0f5] last:mb-0">
                                  {children}
                                </p>
                              );
                            },

                            /* =============================
                               HEADINGS
                            ============================= */

                            h1({
                              children,
                            }) {
                              return (
                                <h1 className="mb-5 mt-2 text-2xl font-bold tracking-tight text-white">
                                  {children}
                                </h1>
                              );
                            },

                            h2({
                              children,
                            }) {
                              return (
                                <h2 className="mb-4 mt-7 text-xl font-semibold tracking-wide text-white">
                                  {children}
                                </h2>
                              );
                            },

                            h3({
                              children,
                            }) {
                              return (
                                <h3 className="mb-3 mt-6 text-lg font-semibold text-[var(--mf-violet)]">
                                  {children}
                                </h3>
                              );
                            },

                            /* =============================
                               BOLD
                            ============================= */

                            strong({
                              children,
                            }) {
                              return (
                                <strong className="font-semibold text-white">
                                  {children}
                                </strong>
                              );
                            },

                            /* =============================
                               LISTS
                            ============================= */

                            ul({
                              children,
                            }) {
                              return (
                                <ul className="mb-5 ml-5 list-disc space-y-2 marker:text-[var(--mf-violet)]">
                                  {children}
                                </ul>
                              );
                            },

                            ol({
                              children,
                            }) {
                              return (
                                <ol className="mb-5 ml-5 list-decimal space-y-2 marker:font-semibold marker:text-[var(--mf-violet)]">
                                  {children}
                                </ol>
                              );
                            },

                            li({
                              children,
                            }) {
                              return (
                                <li className="pl-1 leading-7">
                                  {children}
                                </li>
                              );
                            },

                            /* =============================
                               LINE BREAK

                               THIS FIXES <br>
                            ============================= */

                            br() {
                              return (
                                <br className="block content-['']" />
                              );
                            },

                            /* =============================
                               TABLE
                            ============================= */

                            table({
                              children,
                            }) {
                              return (
                                <div className="my-6 w-full overflow-x-auto rounded-2xl border border-white/10">
                                  <table className="w-full min-w-175 border-collapse text-left text-sm">
                                    {children}
                                  </table>
                                </div>
                              );
                            },

                            thead({
                              children,
                            }) {
                              return (
                                <thead className="bg-[#191e27]">
                                  {children}
                                </thead>
                              );
                            },

                            tbody({
                              children,
                            }) {
                              return (
                                <tbody className="divide-y divide-white/8">
                                  {children}
                                </tbody>
                              );
                            },

                            tr({
                              children,
                            }) {
                              return (
                                <tr className="transition-colors hover:bg-white/4">
                                  {children}
                                </tr>
                              );
                            },

                            th({
                              children,
                            }) {
                              return (
                                <th
                                  className="
                                    border-r
                                    border-white/8
                                    px-5
                                    py-4
                                    text-left
                                    text-sm
                                    font-bold
                                    text-[var(--mf-violet)]
                                    last:border-r-0
                                  "
                                >
                                  {children}
                                </th>
                              );
                            },

                            td({
                              children,
                            }) {
                              return (
                                <td
                                  className="
                                    border-r
                                    border-white/8
                                    px-5
                                    py-4
                                    align-top
                                    text-[15px]
                                    leading-7
                                    text-[#e1e5ec]
                                    last:border-r-0
                                  "
                                >
                                  {children}
                                </td>
                              );
                            },

                            /* =============================
                               BLOCKQUOTE
                            ============================= */

                            blockquote({
                              children,
                            }) {
                              return (
                                <blockquote className="my-5 rounded-r-xl border-l-4 border-[var(--mf-violet)] bg-black/20 px-5 py-4 text-white/75">
                                  {children}
                                </blockquote>
                              );
                            },

                            /* =============================
                               INLINE CODE
                            ============================= */

                            code({
                              children,
                            }) {
                              return (
                                <code className="rounded-md bg-black/35 px-1.5 py-1 font-mono text-sm text-[var(--mf-violet)]">
                                  {children}
                                </code>
                              );
                            },

                            /* =============================
                               CODE BLOCK
                            ============================= */

                            pre({
                              children,
                            }) {
                              return (
                                <pre className="my-5 overflow-x-auto rounded-2xl bg-black/45 p-5 font-mono text-sm leading-6">
                                  {children}
                                </pre>
                              );
                            },

                            /* =============================
                               HORIZONTAL RULE
                            ============================= */

                            hr() {
                              return (
                                <hr className="my-7 border-white/10" />
                              );
                            },
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                        )}

                        {message.insight ? (
                          <DanteInsightPanel insight={message.insight} />
                        ) : null}

                        {message.sources && message.sources.length > 0 ? (
                          <DanteSourcesPanel sources={message.sources} />
                        ) : null}

                        {message.pendingConfirmation ? (
                          <PendingConfirmationPanel
                            pendingConfirmation={message.pendingConfirmation}
                            resolution={message.confirmationResolution}
                            isBusy={confirmingActionId === message.pendingConfirmation.actionId}
                            onConfirm={() =>
                              void handleConfirmAction(message.id, message.pendingConfirmation!.actionId, "confirm")
                            }
                            onCancel={() =>
                              void handleConfirmAction(message.id, message.pendingConfirmation!.actionId, "cancel")
                            }
                          />
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              );
            }
          )}

          <div
            ref={
              messagesEndRef
            }
          />
        </div>
      </div>
      )}

      {/* ===================================================
          COMPOSER — a separate sibling section, always the LAST
          element in this component's own flex column and never
          absolutely positioned, so it can never overlap the
          conversation above it or anything rendered below this
          component by the page (e.g. the DANTE LEARNED module).
          shrink-0 keeps it from ever being compressed by the
          conversation pane's flex-1.
      =================================================== */}

      <form
        onSubmit={handleSubmit}
        className="mt-4 flex shrink-0 items-center gap-3 pb-[env(safe-area-inset-bottom)]"
      >
        <div
          className={`flex min-h-12 flex-1 items-center rounded-[18px] px-4 py-2 text-sm ${hudStyles.hudInputContainer}`}
        >
          <span className="mr-2 font-mono text-xs font-bold text-[#D4FF00] select-none">
            $&gt;
          </span>

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            disabled={isLoading}
            aria-label="Message Dante"
            placeholder="Type a biometric command or query Dante..."
            className="max-h-40 w-full flex-1 resize-none overflow-y-auto bg-transparent font-mono text-xs leading-5 text-white outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
          />

          {/* Live Audio Waveform (4 mini equalizer bars) */}
          <div className="flex items-center gap-0.5 px-2 select-none" aria-hidden="true">
            <span className={`w-0.5 rounded-full bg-[#D4FF00] ${hudStyles.audioBar}`} style={{ animationDelay: "0s" }} />
            <span className={`w-0.5 rounded-full bg-[#D4FF00] ${hudStyles.audioBar}`} style={{ animationDelay: "0.3s" }} />
            <span className={`w-0.5 rounded-full bg-[#D4FF00] ${hudStyles.audioBar}`} style={{ animationDelay: "0.15s" }} />
            <span className={`w-0.5 rounded-full bg-[#D4FF00] ${hudStyles.audioBar}`} style={{ animationDelay: "0.45s" }} />
          </div>
        </div>

        {/* Send / Stop Button */}
        {isLoading ? (
          <button
            type="button"
            onClick={stopStreaming}
            aria-label="Stop Dante's response"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-400 shadow-lg transition hover:bg-rose-500/20 active:scale-95"
          >
            <span className="size-3 rounded-[2px] bg-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send message to Dante"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#D4FF00] text-black shadow-[0_0_16px_rgba(212,255,0,0.3)] transition hover:scale-105 hover:bg-[#D4FF00] hover:shadow-[0_0_22px_rgba(212,255,0,0.6)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22 2L11 13"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M22 2L15 22L11 13L2 9L22 2Z"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}
