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

/* =========================================================
   TYPES
========================================================= */

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatbotResponse = {
  reply?: string;
  error?: string;
  model?: string;
};

export type QuickPrompt = {
  label: string;
  prompt: string;
};

const QUICK_PROMPTS: QuickPrompt[] = [
  {
    label: "Today's Training",
    prompt:
      "What should I train today based on my current plan and recovery?",
  },
  {
    label: "Nutrition",
    prompt: "Review my nutrition targets and suggest adjustments.",
  },
  {
    label: "Recovery",
    prompt: "How is my recovery and what should I prioritize this week?",
  },
  {
    label: "Progress",
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
  compact?: boolean;
  className?: string;
};

const DEFAULT_WELCOME_MESSAGE =
  "Hi. I'm **Dante**, your Muscle Fitness intelligence coach. Ask me about your training, nutrition, recovery or progress.";

const DEFAULT_HERO_SUBTITLE =
  "I understand your training profile, nutrition targets and current plan. Ask me about your training, nutrition, recovery or progress.";

/* =========================================================
   COMPONENT
========================================================= */

export default function DanteChat({
  welcomeMessage = DEFAULT_WELCOME_MESSAGE,
  heroTitle = "Your AI Performance Coach",
  heroSubtitle = DEFAULT_HERO_SUBTITLE,
  quickPrompts = QUICK_PROMPTS,
  compact = false,
  className,
}: DanteChatProps = {}) {
  const [messages, setMessages] =
    useState<ChatMessage[]>([
      {
        id: "welcome",
        role: "assistant",
        content: welcomeMessage,
      },
    ]);

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

      let errorMessage =
        "Dante could not respond. Please try again.";

      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        errorMessage =
          "Dante is taking too long to respond. Please try again.";
      } else if (
        error instanceof Error
      ) {
        errorMessage =
          error.message;
      }

      const errorChatMessage: ChatMessage =
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            `⚠️ **Dante encountered an error**\n\n${errorMessage}`,
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
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#f4bd25]">
                Dante
              </p>

              <p className="text-sm font-medium text-white/55">
                AI Performance Coach
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
                    : "bg-[#f4bd25]",
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

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.28em] text-[#f4bd25]">
            Dante
          </p>

          <h2 className="mt-2 text-2xl font-bold text-white md:text-3xl">
            {heroTitle}
          </h2>

          <p className="mt-3 max-w-md text-sm leading-6 text-white/50">
            {heroSubtitle}
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            {quickPrompts.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => handleQuickPrompt(item.prompt)}
                disabled={isLoading}
                className="
                  rounded-full
                  border
                  border-[#f4bd25]/25
                  bg-[#f4bd25]/8
                  px-4
                  py-2.5
                  text-xs
                  font-bold
                  uppercase
                  tracking-wide
                  text-[#f4bd25]
                  transition
                  hover:border-[#f4bd25]/50
                  hover:bg-[#f4bd25]/14
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
                        bg-[#f4bd25]
                        px-5
                        py-3.5
                        text-base
                        font-medium
                        leading-7
                        text-black
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
                          border-[#f4bd25]/30
                          bg-[#f4bd25]/10
                          text-sm
                          font-bold
                          text-[#f4bd25]
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
                          bg-[#252b37]
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
                          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#f4bd25]">
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
                                <h3 className="mb-3 mt-6 text-lg font-semibold text-[#f4bd25]">
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
                                <ul className="mb-5 ml-5 list-disc space-y-2 marker:text-[#f4bd25]">
                                  {children}
                                </ul>
                              );
                            },

                            ol({
                              children,
                            }) {
                              return (
                                <ol className="mb-5 ml-5 list-decimal space-y-2 marker:font-semibold marker:text-[#f4bd25]">
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
                                    text-[#f4bd25]
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
                                <blockquote className="my-5 rounded-r-xl border-l-4 border-[#f4bd25] bg-black/20 px-5 py-4 text-white/75">
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
                                <code className="rounded-md bg-black/35 px-1.5 py-1 font-mono text-sm text-[#f4bd25]">
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

              <div className="rounded-3xl rounded-tl-md bg-[#252b37] px-5 py-4">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#f4bd25]">
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
            bg-[#f4bd25]
            text-black
            shadow-lg
            shadow-[#f4bd25]/10
            transition
            hover:scale-105
            hover:bg-[#ffd24a]
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