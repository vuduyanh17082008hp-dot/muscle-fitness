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

import { DanteRobot } from "@/components/dante/dante-robot";
import { BiometricFieldCanvas } from "@/components/dante/biometric-field-canvas";
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
  /** Client clock when the user turn was created — optional risk timing. */
  createdAt?: string;
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
      createdAt: new Date().toISOString(),
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
                    ...(entry.createdAt ? { createdAt: entry.createdAt } : {}),
                  })),
                {
                  role: "user" as const,
                  content: trimmed,
                  createdAt: userMessage.createdAt,
                },
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
        "relative flex w-full flex-col font-sans overflow-hidden rounded-[24px] border border-white/6 p-4 sm:p-6 transition-all duration-500",
        hudStyles.obsidianCanvas,
        compact
          ? "h-[min(65dvh,560px)] max-h-[min(65dvh,560px)] min-h-[460px]"
          : "h-[min(82vh,860px)] min-h-[580px]",
        className
      )}
    >
      {/* 2D PROCEDURAL BIOMETRIC FIELD CANVAS (Grid & Micro-Particles) */}
      <BiometricFieldCanvas />

      {/* Ambient Lighting Washes — Persistent in BOTH States */}
      <div aria-hidden="true" className={`absolute inset-0 pointer-events-none z-0 ${hudStyles.topLimeWash}`} />
      <div aria-hidden="true" className={`absolute inset-0 pointer-events-none z-0 ${hudStyles.bottomVioletWash}`} />
      <div aria-hidden="true" className={`absolute inset-0 pointer-events-none z-0 ${hudStyles.leftBlueWash}`} />

      {/* Screen Reader Accessibility */}
      <span aria-live="polite" className="sr-only">
        {DANTE_STATE_LABEL[visualState]}
      </span>

      {/* ===================================================
          DANTE SUPERVISOR HEADER (IN-PLACE FLUID MORPH)
      =================================================== */}
      <div
        className={cn(
          "relative z-20 flex shrink-0 items-center transition-all duration-500",
          isEmpty
            ? "flex-col items-center justify-center my-3 py-2"
            : "mb-3 flex-row items-center justify-between rounded-[18px] border border-white/6 bg-[#0e1016]/60 px-4 py-2.5 backdrop-blur-md"
        )}
      >
        {/* Living Mascot Supervisor */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "relative flex items-center justify-center transition-all duration-500",
              isEmpty ? "p-4 scale-100" : "scale-75 origin-left"
            )}
          >
            {/* Volumetric Cone Light (Active in State 1) */}
            {isEmpty && (
              <div aria-hidden="true" className={`absolute -top-2 w-[180px] h-[130px] pointer-events-none ${hudStyles.volumetricCone}`} />
            )}

            {/* Elliptical Floor Reflection Sheen */}
            {isEmpty && (
              <div aria-hidden="true" className={`absolute bottom-1 w-[130px] h-[22px] rounded-full pointer-events-none ${hudStyles.floorSheen}`} />
            )}

            {/* Concentric SVG Dashed Orbit Rings */}
            {isEmpty && (
              <svg
                viewBox="-300 -140 600 280"
                className="absolute inset-0 size-full overflow-visible pointer-events-none"
                aria-hidden="true"
              >
                <ellipse
                  rx="275"
                  ry="115"
                  fill="none"
                  stroke="rgba(212, 255, 0, 0.35)"
                  strokeWidth="1"
                  strokeDasharray="4 8"
                  transform="rotate(-8)"
                  className={hudStyles.orbitRingCW}
                />
                <ellipse
                  rx="210"
                  ry="85"
                  fill="none"
                  stroke="rgba(212, 255, 0, 0.22)"
                  strokeWidth="1"
                  strokeDasharray="2 6"
                  transform="rotate(12)"
                  className={hudStyles.orbitRingCCW}
                />
              </svg>
            )}

            {/* Laser Scanline Beam & Mascot Float */}
            <div className="relative z-10 overflow-hidden py-1">
              {isEmpty && (
                <div className={`absolute left-0 right-0 z-20 pointer-events-none ${hudStyles.scanlineBeam}`} />
              )}
              <div className={hudStyles.mascotFloat}>
                <DanteRobot
                  state={visualState}
                  size="sm"
                  interactive
                />
              </div>
            </div>
          </div>

          {/* Morphing Metadata Breadcrumb */}
          <div className={isEmpty ? "text-center" : "text-left"}>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4FF00]">
              {isEmpty ? "DANTE BIOMETRIC HUD • ONLINE" : "DANTE AI // PERFORMANCE INTELLIGENCE • LIVE"}
            </p>
            {isEmpty ? (
              <h2 className="mt-1 text-xl font-bold tracking-tight text-white md:text-2xl lg:text-3xl">
                {heroTitle}
              </h2>
            ) : (
              <p className="text-[11px] font-mono text-zinc-400">
                ACTIVE CONTEXT: TRAINING • RECOVERY • NUTRITION
              </p>
            )}
          </div>
        </div>

        {/* Live Status Beacon (when in active chat mode) */}
        {!isEmpty && (
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            <span
              className={cn(
                "size-2 rounded-full transition-colors",
                visualState === "error"
                  ? "bg-rose-400 shadow-[0_0_8px_#f43f5e]"
                  : visualState === "idle"
                    ? "bg-[#D4FF00] shadow-[0_0_8px_#D4FF00]"
                    : "bg-[var(--mf-violet)] shadow-[0_0_8px_var(--mf-violet)] animate-pulse"
              )}
            />
            <span>{visualState === "idle" ? "ONLINE" : visualState}</span>
          </div>
        )}
      </div>

      {/* ===================================================
          STATE 1: SATELLITE PROMPT ORBIT SYSTEM
      =================================================== */}
      {isEmpty && (
        <div className="relative z-30 flex-1 w-full max-w-7xl mx-auto grid grid-cols-1 gap-3.5 sm:block sm:h-full my-auto transition-all duration-300">
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

            const spatialPositionClass = [
              "sm:absolute sm:top-2 sm:left-0 md:left-2 lg:left-6 xl:left-10 sm:max-w-[280px]",
              "sm:absolute sm:top-2 sm:right-0 md:right-2 lg:right-6 xl:right-10 sm:max-w-[280px]",
              "sm:absolute sm:bottom-6 sm:left-2 md:left-4 lg:left-10 xl:left-16 sm:max-w-[280px]",
              "sm:absolute sm:bottom-6 sm:right-2 md:right-4 lg:right-10 xl:right-16 sm:max-w-[280px]",
            ][index % 4];

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleQuickPrompt(item.prompt)}
                onPointerEnter={() => setHoveredPromptIndex(index)}
                onPointerLeave={() => setHoveredPromptIndex(null)}
                disabled={isLoading}
                className={`relative px-4 py-3.5 text-left transition ${hudStyles.hudCard} ${driftClass} ${spatialPositionClass} ${opacityClass} disabled:cursor-not-allowed disabled:opacity-40`}
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
      )}

      {/* ===================================================
          STATE 2: ACTIVE CONVERSATION THREAD (HUD GLASS TELEMETRY)
      =================================================== */}
      {!isEmpty && (
        <div
          ref={chatWindowRef}
          onScroll={handleChatWindowScroll}
          className="relative z-20 flex-1 min-h-0 w-full max-w-3xl mx-auto overflow-y-auto px-2 sm:px-4 py-3 space-y-4"
        >
          {messages.map((message) => {
            const isUser = message.role === "user";

            return (
              <div
                key={message.id}
                className={cn(
                  "dante-message-in flex w-full",
                  isUser ? "justify-end" : "justify-start"
                )}
              >
                {isUser ? (
                  /* User Message: Sleek right-aligned obsidian glass pill */
                  <div className="max-w-[85%] sm:max-w-[75%] rounded-[16px_16px_4px_16px] border border-[#D4FF00]/25 bg-[#16181e]/85 px-4.5 py-3 text-sm sm:text-base font-medium leading-relaxed text-white shadow-lg backdrop-blur-md">
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                ) : (
                  /* Dante Message: Left-aligned glass panel */
                  <div className="flex w-full max-w-[95%] sm:max-w-[90%] flex-col gap-2 rounded-[16px_16px_16px_4px] border border-white/8 bg-[#0e1016]/75 p-4 sm:p-5 shadow-xl backdrop-blur-xl">
                    {/* Header status pill: [D] icon badge with glowing lime pulse dot */}
                    <div className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-md border border-[#D4FF00]/30 bg-[#D4FF00]/10 font-mono text-[10px] font-black text-[#D4FF00]">
                        D
                      </span>
                      <span className="size-1.5 rounded-full bg-[#D4FF00] shadow-[0_0_6px_#D4FF00]" />
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        DANTE // INTELLIGENCE COACH
                      </span>
                    </div>

                    {/* Thinking state with 3 animated equalizer bars */}
                    {message.content.length === 0 && !message.isComplete ? (
                      <div
                        aria-live="polite"
                        className="flex items-center gap-2.5 py-2 font-mono text-xs font-bold tracking-wider text-[#D4FF00]"
                      >
                        <span className="size-1.5 rounded-full bg-[#D4FF00] animate-ping" />
                        <span>// DANTE ANALYZING BIOMETRICS</span>
                        <div className="flex items-center gap-0.5 ml-1 select-none" aria-hidden="true">
                          <span className={`w-0.5 rounded-full bg-[#D4FF00] ${hudStyles.audioBar}`} style={{ animationDelay: "0s" }} />
                          <span className={`w-0.5 rounded-full bg-[#D4FF00] ${hudStyles.audioBar}`} style={{ animationDelay: "0.2s" }} />
                          <span className={`w-0.5 rounded-full bg-[#D4FF00] ${hudStyles.audioBar}`} style={{ animationDelay: "0.4s" }} />
                        </div>
                      </div>
                    ) : (
                      <div className="prose prose-invert max-w-none text-white/90 text-sm leading-relaxed">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw, rehypeSanitize]}
                          components={{
                            p({ children }) {
                              return (
                                <p className="mb-3.5 text-sm sm:text-[15px] leading-relaxed text-[#edf0f5] last:mb-0">
                                  {children}
                                </p>
                              );
                            },
                            h1({ children }) {
                              return (
                                <h1 className="mb-4 mt-2 text-xl sm:text-2xl font-bold tracking-tight text-white">
                                  {children}
                                </h1>
                              );
                            },
                            h2({ children }) {
                              return (
                                <h2 className="mb-3 mt-5 text-lg sm:text-xl font-semibold tracking-wide text-white">
                                  {children}
                                </h2>
                              );
                            },
                            h3({ children }) {
                              return (
                                <h3 className="mb-2 mt-4 text-base font-semibold text-[#D4FF00]">
                                  {children}
                                </h3>
                              );
                            },
                            strong({ children }) {
                              return (
                                <strong className="font-semibold text-white">
                                  {children}
                                </strong>
                              );
                            },
                            ul({ children }) {
                              return (
                                <ul className="mb-4 ml-5 list-disc space-y-1.5 marker:text-[#D4FF00]">
                                  {children}
                                </ul>
                              );
                            },
                            ol({ children }) {
                              return (
                                <ol className="mb-4 ml-5 list-decimal space-y-1.5 marker:font-semibold marker:text-[#D4FF00]">
                                  {children}
                                </ol>
                              );
                            },
                            li({ children }) {
                              return (
                                <li className="pl-1 text-sm sm:text-[15px] leading-relaxed">
                                  {children}
                                </li>
                              );
                            },
                            br() {
                              return <br className="block content-['']" />;
                            },
                            table({ children }) {
                              return (
                                <div className="my-4 w-full overflow-x-auto rounded-xl border border-white/10">
                                  <table className="w-full min-w-160 border-collapse text-left text-xs sm:text-sm">
                                    {children}
                                  </table>
                                </div>
                              );
                            },
                            thead({ children }) {
                              return (
                                <thead className="bg-[#12141a] text-[#D4FF00]">
                                  {children}
                                </thead>
                              );
                            },
                            tbody({ children }) {
                              return (
                                <tbody className="divide-y divide-white/8">
                                  {children}
                                </tbody>
                              );
                            },
                            tr({ children }) {
                              return (
                                <tr className="transition-colors hover:bg-white/4">
                                  {children}
                                </tr>
                              );
                            },
                            th({ children }) {
                              return (
                                <th className="border-r border-white/8 px-4 py-3 text-left font-bold text-[#D4FF00] last:border-r-0">
                                  {children}
                                </th>
                              );
                            },
                            td({ children }) {
                              return (
                                <td className="border-r border-white/8 px-4 py-3 align-top text-[#e1e5ec] last:border-r-0">
                                  {children}
                                </td>
                              );
                            },
                            blockquote({ children }) {
                              return (
                                <blockquote className="my-4 rounded-r-xl border-l-4 border-[#D4FF00] bg-black/20 px-4 py-3 text-white/75">
                                  {children}
                                </blockquote>
                              );
                            },
                            code({ children }) {
                              return (
                                <code className="rounded-md bg-black/35 px-1.5 py-0.5 font-mono text-xs text-[#D4FF00]">
                                  {children}
                                </code>
                              );
                            },
                            pre({ children }) {
                              return (
                                <pre className="my-4 overflow-x-auto rounded-xl bg-black/45 p-4 font-mono text-xs leading-5">
                                  {children}
                                </pre>
                              );
                            },
                            hr() {
                              return <hr className="my-5 border-white/10" />;
                            },
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
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
                )}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* ===================================================
          COMPOSER — Persistent, Pinned at Bottom Center
      =================================================== */}
      <form
        onSubmit={handleSubmit}
        className="relative z-30 mt-3 w-full max-w-3xl mx-auto flex shrink-0 items-center gap-3 pb-[env(safe-area-inset-bottom)]"
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
            className="max-h-40 w-full flex-1 resize-none border-none bg-transparent font-mono text-xs leading-5 text-white outline-none shadow-none placeholder:text-zinc-500 focus:border-none focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
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
