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
import {
  DANTE_STATE_LABEL,
  useDantePresence,
  type DanteActivity,
} from "@/components/dante/dante-presence";
import { cn } from "@/lib/utils";
import { FORM_COACH_HANDOFF_KEY } from "@/lib/form-coach/handoff";
import type { DanteInsight } from "@/lib/dante-core/insight";

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
  /** "Why This?" evidence, when this reply carried a real, deterministic recommendation. Never fabricated by the LLM. */
  insight?: DanteInsight | null;
  /** Set only when Dante proposed a write tool call — nothing is saved until the user explicitly confirms (see PendingConfirmationPanel below). */
  pendingConfirmation?: PendingConfirmation | null;
  /** Once the user acts on pendingConfirmation, frozen here so the buttons don't re-render as active after a page state update. */
  confirmationResolution?: "confirmed" | "cancelled" | "failed" | null;
};

type ChatbotResponse = {
  reply?: string;
  error?: string;
  model?: string;
  insight?: DanteInsight | null;
  pendingConfirmation?: PendingConfirmation | null;
};

export type QuickPrompt = {
  label: string;
  prompt: string;
};

/**
 * Natural-language conversation starters, not cold category labels
 * (spec: "Better Empty State"). These are the generic fallback shown
 * when no real-state-aware suggestions are supplied — see
 * `contextualSuggestions` below and lib/dante-core/build-chat-suggestions.ts,
 * which sharpens these into workout/protein/recovery-specific prompts
 * from the user's actual data wherever a page supplies real signals.
 */
const QUICK_PROMPTS: QuickPrompt[] = [
  {
    label: "🏋️ What should I train today?",
    prompt:
      "What should I train today based on my current plan and recovery?",
  },
  {
    label: "🥗 Help me plan meals for my remaining macros.",
    prompt: "Help me plan meals for my remaining macros today.",
  },
  {
    label: "⚡ Am I recovered enough to train hard?",
    prompt: "Am I recovered enough to train hard today?",
  },
  {
    label: "📈 How am I progressing this month?",
    prompt: "Summarize my recent progress and what to focus on next.",
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

  const [activity, setActivity] =
    useState<DanteActivity>("idle");

  const visualState = useDantePresence(activity);

  const isEmpty = messages.length === 1;

  const messagesEndRef =
    useRef<HTMLDivElement | null>(
      null
    );

  /* =======================================================
     AUTO SCROLL
  ======================================================= */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, isLoading]);

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

    setMessages((previous) => [
      ...previous,
      userMessage,
    ]);

    setInput("");
    setIsLoading(true);
    setActivity("thinking");

    try {
      const controller =
        new AbortController();

      const timeout =
        window.setTimeout(
          () => {
            controller.abort();
          },
          60000
        );

      let response: Response;

      try {
        response =
          await fetch(
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
                }),

              signal:
                controller.signal,
            }
          );
      } finally {
        window.clearTimeout(
          timeout
        );
      }

      let data: ChatbotResponse;

      try {
        data =
          (await response.json()) as ChatbotResponse;
      } catch {
        throw new Error(
          "The server returned an invalid response."
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error ??
            `Request failed with status ${response.status}.`
        );
      }

      if (!data.reply) {
        throw new Error(
          "Dante returned an empty response."
        );
      }

      const assistantMessage: ChatMessage =
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply,
          insight: data.insight ?? null,
          pendingConfirmation: data.pendingConfirmation ?? null,
          confirmationResolution: null,
        };

      setMessages((previous) => [
        ...previous,
        assistantMessage,
      ]);

      setActivity("success");
    } catch (error: unknown) {
      console.error(
        "[DANTE FRONTEND ERROR]",
        error
      );

      setActivity("error");

      /*
       * Reassuring, non-technical failure state (spec: "Failure
       * State"). Never crash the page and never leave the user
       * thinking their own data was affected — Groq failing has no
       * bearing on training/nutrition/recovery data, which all lives
       * in Supabase, not in this request. Technical detail still goes
       * to the console above for debugging.
       */
      const errorChatMessage: ChatMessage =
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "Dante is temporarily unavailable.\n\nYour training, nutrition and recovery data are still available.",
        };

      setMessages((previous) => [
        ...previous,
        errorChatMessage,
      ]);
    } finally {
      setIsLoading(false);
    }
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
    event: KeyboardEvent<HTMLInputElement>
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      void sendMessage();
    }
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
        "flex w-full flex-col font-sans",
        compact ? "h-[600px] min-h-[520px]" : "h-[72vh] min-h-170",
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
            items-center
            justify-between
            gap-3
            rounded-2xl
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
        <div
          className="
            mb-4
            flex
            flex-col
            items-center
            rounded-3xl
            border
            border-white/10
            bg-gradient-to-b
            from-[#181c25]
            to-[#12151c]
            px-6
            py-10
            text-center
          "
        >
          <DanteRobot
            state={visualState}
            size="lg"
            interactive
          />

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.28em] text-[var(--mf-violet)]">
            Dante
          </p>

          <h2 className="mt-2 text-2xl font-bold text-white md:text-3xl">
            {heroTitle}
          </h2>

          <p className="mt-3 max-w-md text-sm leading-6 text-white/50">
            {heroSubtitle}
          </p>

          <div className="mt-7 grid w-full max-w-md gap-2 sm:grid-cols-2">
            {emptyStatePrompts.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => handleQuickPrompt(item.prompt)}
                disabled={isLoading}
                className="
                  rounded-2xl
                  border
                  border-[var(--mf-violet)]/25
                  bg-[var(--mf-violet)]/8
                  px-4
                  py-3
                  text-left
                  text-xs
                  font-semibold
                  leading-5
                  text-[var(--mf-violet)]
                  transition
                  hover:border-[var(--mf-violet)]/50
                  hover:bg-[var(--mf-violet)]/14
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                "
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================
          CHAT WINDOW
      =================================================== */}

      <div
        className="
          flex-1
          overflow-y-auto
          rounded-3xl
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
                  className={
                    isUser
                      ? "flex justify-end"
                      : "flex justify-start"
                  }
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
                            MARKDOWN
                        ================================= */}

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

                        {message.insight ? (
                          <DanteInsightPanel insight={message.insight} />
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

          {/* ===============================================
              DANTE THINKING
          =============================================== */}

          {isLoading && (
            <div className="flex items-start gap-3">

              <div className="mt-1 hidden shrink-0 sm:block">
                <DanteRobot
                  state="thinking"
                  size="sm"
                />
              </div>

              <div className="rounded-3xl rounded-tl-md bg-mf-surface-elevated px-5 py-4">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--mf-violet)]">
                  Dante is thinking…
                </div>
              </div>
            </div>
          )}

          <div
            ref={
              messagesEndRef
            }
          />
        </div>
      </div>

      {/* ===================================================
          INPUT AREA
      =================================================== */}

      <form
        onSubmit={
          handleSubmit
        }
        className="mt-4 flex items-center gap-3"
      >
        <div
          className="
            flex
            min-h-17
            flex-1
            items-center
            rounded-full
            bg-[#171c26]
            px-5
            transition
            focus-within:bg-[#1c222e]
          "
        >
          <input
            value={
              input
            }
            onChange={(
              event
            ) => {
              setInput(
                event.target.value
              );
            }}
            onKeyDown={
              handleKeyDown
            }
            onFocus={
              handleInputFocus
            }
            onBlur={
              handleInputBlur
            }
            disabled={
              isLoading
            }
            placeholder="Ask Dante about training, nutrition, recovery..."
            className="
              min-h-17
              flex-1
              bg-transparent
              text-base
              font-normal
              leading-6
              text-white
              outline-none
              placeholder:text-white/30
              disabled:cursor-not-allowed
              disabled:opacity-60
            "
          />
        </div>

        {/* =================================================
            SEND BUTTON
        ================================================= */}

        <button
          type="submit"
          disabled={
            isLoading ||
            !input.trim()
          }
          aria-label="Send message to Dante"
          className="
            flex
            h-14
            w-14
            shrink-0
            items-center
            justify-center
            rounded-full
            bg-amber-400
            text-black
            shadow-lg
            shadow-amber-400/10
            transition
            hover:scale-105
            hover:bg-amber-300
            active:scale-95
            disabled:cursor-not-allowed
            disabled:opacity-30
          "
        >
          <svg
            width="25"
            height="25"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M22 2L11 13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <path
              d="M22 2L15 22L11 13L2 9L22 2Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </div>
  );
}