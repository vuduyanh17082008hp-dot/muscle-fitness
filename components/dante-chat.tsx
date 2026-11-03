"use client";

import React, {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import type {
  FormEvent,
  KeyboardEvent,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, History, RotateCcw, SquarePen } from "lucide-react";
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
import { announceFoodLogChanged, COACH_CONTEXT_CHANGED_EVENT, COACH_TURN_STARTED_EVENT } from "@/lib/coach-context-event";
import {
  parseChatStreamChunk,
  resolveAbortedContent,
  resolveConfirmationOutcome,
  resolveStreamErrorContent,
  type ChatStreamEvent,
  type ChatStreamPendingConfirmation,
  type ChatStreamSource,
  type DanteNutritionTurn,
} from "@/lib/dante-core/chat-stream-protocol";
import { NutritionBlocks, NutritionQuickActions } from "@/components/nutrition/coach/coach-chat-ui";
import { readLastThread, rememberThread, todaysThread } from "@/lib/dante-core/active-thread";
import type { StoredDanteMessage } from "@/lib/dante-core/conversation-store";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { DanteVoiceInput } from "@/components/dante-voice-input";
import type { ContextStatus, DanteTodayContext } from "@/lib/dante-core/today-context";

/* =========================================================
   TYPES
========================================================= */

type PendingConfirmation = ChatStreamPendingConfirmation;

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
  /** MF-S1: the server's own words for the outcome (read-back result, or why it was refused). */
  confirmationMessage?: string | null;
  isComplete?: boolean;
  wasAborted?: boolean;
  /** Client id of the turn (user message + its reply) — what a retry resends so the server never duplicates it. */
  turnId?: string;
  /** Set when the reply was never confirmed complete (refresh/disconnect mid-stream, or a failure). */
  historyStatus?: "pending" | "interrupted" | "error";
  /** The server said this turn did NOT reach conversation history. */
  notSaved?: boolean;
  /** Dante's nutrition capability answered: engine-built option lists / comparisons / ingredient tables / change proposals. */
  nutrition?: DanteNutritionTurn | null;
};

type ConfirmationResolution = "confirmed" | "cancelled" | "superseded" | "failed" | "expired" | "unknown" | null;

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
    label: "What to train today",
    prompt: "Based on my current readiness, what should I train today?",
  },
  {
    tag: "Nutrition target",
    label: "Hit my protein target",
    prompt: "What should I eat to hit my remaining protein target?",
  },
  {
    tag: "Recovery",
    label: "Recovery check",
    prompt: "How is my recovery looking today, and what is driving it?",
  },
  {
    tag: "30-day trajectory",
    label: "Last 30 days",
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
   * Today's verified athlete context, built server-side (lib/dante-core/today-context.ts) from what actually loaded —
   * never guessed. Shown above the conversation so older replies in a restored thread are never mistaken for today.
   */
  todayContext?: DanteTodayContext;
};

/** The conversation this tab last had open ("" = a new, unsaved chat), so returning to Dante reopens it. */
function formatAsOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "earlier";
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

const DEFAULT_WELCOME_MESSAGE =
  "Hi. I'm **Dante**, your Muscle Fitness intelligence coach. Ask me about your training, nutrition, recovery or progress.";

const SEVERITY_DOT: Record<string, string> = {
  warning: "bg-mf-glass-warning",
  notice: "bg-mf-glass-warning",
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
            className="inline-flex min-h-11 items-center rounded-md border border-mf-glass-text bg-mf-glass-brand px-4 text-sm font-semibold text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
          >
            {insight.nextAction.label}
          </Link>
        ) : null}

        {hasWhy ? (
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md border border-mf-glass-border-strong px-4 text-sm font-semibold text-mf-glass-text-secondary transition hover:bg-mf-glass-hover">
              {insight.severity ? (
                <span
                  className={cn("size-1.5 rounded-full", SEVERITY_DOT[insight.severity])}
                  aria-hidden="true"
                />
              ) : null}
              Why this?
            </summary>

            <div className="mt-3 space-y-3 rounded-md border border-mf-glass-border bg-mf-glass-bg-deep p-4">
              {insight.reasons.length > 0 ? (
                <ul className="space-y-1.5">
                  {insight.reasons.map((reason, index) => (
                    <li key={index} className="text-sm leading-6 text-mf-glass-text-secondary">
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
                      className="rounded-md border border-mf-glass-border bg-mf-glass-surface p-2.5"
                    >
                      <p className="text-xs font-semibold text-mf-glass-text-muted">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-sm font-bold tabular-nums text-mf-glass-text">{item.value}</p>
                      {item.note ? (
                        <p className="mt-0.5 text-xs text-mf-glass-text-muted">{item.note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {insight.confidence ? (
                <p className="text-xs font-semibold text-mf-glass-text-muted">
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
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md border border-mf-glass-border-strong px-4 text-sm font-semibold text-mf-glass-text-secondary transition hover:bg-mf-glass-hover">
          Sources ({safeSources.length})
        </summary>

        <ul className="mt-3 space-y-2 rounded-md border border-mf-glass-border bg-mf-glass-bg-deep p-4">
          {safeSources.map((source, index) => (
            <li key={`${source.url}-${index}`} className="text-sm leading-6">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-mf-glass-text underline underline-offset-4"
              >
                {source.title}
              </a>
              {source.type ? (
                <span className="ml-2 text-xs text-mf-glass-text-muted">
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

/* MF-S1: a reviewable proposal (title, reason, current → proposed, uncertainty) with Accept / Modify / Reject.
   Status comes only from the server: PROPOSED until an Accept is confirmed as APPLIED (read back), never optimistic. */
function ProposalCard({
  pendingConfirmation,
  details,
  resolution,
  message,
  isBusy,
  onConfirm,
  onCancel,
  onModify,
}: {
  pendingConfirmation: PendingConfirmation;
  details: NonNullable<PendingConfirmation["details"]>;
  resolution: ConfirmationResolution | undefined;
  message: string | null | undefined;
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onModify: (value: number) => void;
}) {
  const vi = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(details.title);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(details.modify?.value ?? ""));
  const status = resolution === "confirmed" ? "APPLIED" : resolution === "cancelled" ? "REJECTED" : resolution === "superseded" ? "REPLACED" : resolution === "expired" ? "EXPIRED" : resolution === "failed" ? "FAILED" : resolution === "unknown" ? "UNKNOWN" : "PROPOSED";
  const statusLabel = vi
    ? { PROPOSED: "Đề xuất", APPLIED: "Đã áp dụng", REJECTED: "Đã từ chối", REPLACED: "Đã thay", EXPIRED: "Hết hạn", FAILED: "Không áp dụng được", UNKNOWN: "Chưa rõ kết quả" }[status]
    : { PROPOSED: "Proposed", APPLIED: "Applied", REJECTED: "Rejected", REPLACED: "Replaced", EXPIRED: "Expired", FAILED: "Not applied", UNKNOWN: "Result unknown" }[status];
  const tone = status === "APPLIED" ? "text-mf-glass-success" : status === "FAILED" || status === "UNKNOWN" ? "text-mf-glass-warning" : "text-mf-glass-text-muted";
  const outcome = message
    ?? (status === "APPLIED" ? (vi ? "Đã lưu và đọc lại từ dữ liệu của bạn." : "Saved and read back from your data.")
      : status === "REJECTED" ? (vi ? "Không có gì thay đổi." : "Nothing was changed.")
      : status === "REPLACED" ? (vi ? "Một đề xuất mới hơn đã thay thế đề xuất này — không có gì thay đổi từ nó." : "A newer proposal replaced this one — nothing was changed by it.")
      : status === "EXPIRED" ? (vi ? "Đề xuất đã hết hạn — không có gì thay đổi." : "This proposal expired — nothing was changed.")
      : status === "FAILED" ? (vi ? "Không áp dụng được. Không có gì thay đổi." : "It couldn't be applied. Nothing was changed.")
      : status === "UNKNOWN" ? (vi ? "Không xác nhận được kết quả — hãy kiểm tra trước khi thử lại." : "We couldn't confirm the result — check before trying again.")
      : null);
  const parsed = Number(value);
  const modifyValid = details.modify !== null && Number.isFinite(parsed) && parsed >= details.modify.min && parsed <= details.modify.max;
  const fieldId = `modify-${pendingConfirmation.actionId}`;

  return (
    <section aria-label={details.title} className="mt-3 rounded-md border border-mf-glass-border-strong bg-mf-glass-bg-deep p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-mf-glass-text">{details.title}</h3>
        <span className={cn("text-xs font-bold uppercase tracking-[0.08em]", tone)} aria-live="polite">{statusLabel}</span>
      </div>
      <p className="mt-1 text-mf-glass-text-secondary">{details.reason}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-mf-glass-text-muted">{vi ? "Áp dụng cho" : "Changes"}</dt>
        <dd className="text-mf-glass-text">{details.target}</dd>
        <dt className="text-mf-glass-text-muted">{vi ? "Hiện tại" : "Now"}</dt>
        <dd className="text-mf-glass-text break-words">{details.current}</dd>
        <dt className="text-mf-glass-text-muted">{vi ? "Đề xuất" : "Proposed"}</dt>
        <dd className="font-semibold text-mf-glass-text break-words">{details.proposed}</dd>
      </dl>
      {details.uncertainty ? <p className="mt-2 text-xs text-mf-glass-text-muted">{details.uncertainty}</p> : null}

      {status === "PROPOSED" ? (
        editing && details.modify ? (
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (modifyValid) onModify(parsed);
            }}
          >
            <label htmlFor={fieldId} className="flex flex-col text-xs text-mf-glass-text-muted">
              {details.modify.label} ({details.modify.unit})
              <input
                id={fieldId}
                type="number"
                inputMode="numeric"
                min={details.modify.min}
                max={details.modify.max}
                step={details.modify.step}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="mt-1 min-h-11 w-28 rounded-md border border-mf-glass-border-strong bg-mf-glass-bg px-2 text-base text-mf-glass-text"
              />
            </label>
            <button type="submit" disabled={isBusy || !modifyValid} className="min-h-11 rounded-md border border-mf-glass-text bg-mf-glass-brand px-4 font-semibold text-mf-glass-brand-ink disabled:opacity-50">
              {vi ? "Cập nhật đề xuất" : "Update proposal"}
            </button>
            <button type="button" disabled={isBusy} onClick={() => setEditing(false)} className="min-h-11 rounded-md border border-mf-glass-border-strong px-4 font-semibold text-mf-glass-text-secondary disabled:opacity-50">
              {vi ? "Thôi" : "Back"}
            </button>
          </form>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={isBusy} onClick={onConfirm} className="min-h-11 rounded-md border border-mf-glass-text bg-mf-glass-brand px-4 font-semibold text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover disabled:opacity-50">
              {vi ? "Chấp nhận" : "Accept"}
            </button>
            {details.modify ? (
              <button type="button" disabled={isBusy} onClick={() => setEditing(true)} className="min-h-11 rounded-md border border-mf-glass-border-strong px-4 font-semibold text-mf-glass-text transition hover:bg-mf-glass-hover disabled:opacity-50">
                {vi ? "Sửa" : "Modify"}
              </button>
            ) : null}
            <button type="button" disabled={isBusy} onClick={onCancel} className="min-h-11 rounded-md border border-mf-glass-border-strong px-4 font-semibold text-mf-glass-text-secondary transition hover:bg-mf-glass-hover disabled:opacity-50">
              {vi ? "Từ chối" : "Reject"}
            </button>
          </div>
        )
      ) : null}
      {outcome || (status === "PROPOSED" && message) ? <p className={cn("mt-2 font-semibold", tone)} role="status">{outcome ?? message}</p> : null}
      {status === "APPLIED" ? (
        <Link href={details.href} className="mt-2 inline-flex min-h-11 items-center font-semibold text-mf-glass-text underline underline-offset-4">
          {details.hrefLabel} →
        </Link>
      ) : null}
    </section>
  );
}

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
      <p className="mt-3 text-sm font-semibold text-mf-glass-text-muted">
        This proposal expired — nothing was changed.
      </p>
    );
  }

  if (resolution === "confirmed") {
    return (
      <p className="mt-3 text-sm font-semibold text-mf-glass-success">
        ✓ Done — {pendingConfirmation.summary.toLowerCase()}.
      </p>
    );
  }

  if (resolution === "cancelled" || resolution === "superseded") {
    return (
      <p className="mt-3 text-sm font-semibold text-mf-glass-text-muted">
        {resolution === "superseded" ? "Replaced by a newer proposal" : "Cancelled"} — nothing was changed.
      </p>
    );
  }

  if (resolution === "failed") {
    return (
      <p className="mt-3 text-sm font-semibold text-mf-glass-warning">
        That couldn&apos;t be saved. Nothing was changed.
      </p>
    );
  }

  // The request may have reached the server before the connection failed: never claim "nothing changed" here.
  if (resolution === "unknown") {
    return (
      <p className="mt-3 text-sm font-semibold text-mf-glass-warning">
        We couldn&apos;t confirm the result. Check your log before trying again — it may already be saved.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-mf-glass-border-strong bg-mf-glass-bg-deep p-3">
      <span className="mr-2 text-sm text-mf-glass-text">{pendingConfirmation.summary}</span>

      <button
        type="button"
        disabled={isBusy}
        onClick={onConfirm}
        className="min-h-11 rounded-md border border-mf-glass-text bg-mf-glass-brand px-4 text-sm font-semibold text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover disabled:opacity-50"
      >
        {isBusy ? "Saving…" : pendingConfirmation.toolName === "log_meal_draft" || pendingConfirmation.toolName === "log_food" ? "Confirm & Save" : "Confirm"}
      </button>

      <button
        type="button"
        disabled={isBusy}
        onClick={onCancel}
        className="min-h-11 rounded-md border border-mf-glass-border-strong px-4 text-sm font-semibold text-mf-glass-text-secondary transition hover:bg-mf-glass-hover disabled:opacity-50"
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
  compact = false,
  className,
  contextPayload,
  restoreHistory = false,
  todayContext,
}: DanteChatProps = {}) {
  const router = useRouter();
  const composerHintId = useId();
  const [historyOpen, setHistoryOpen] = useState(false);
  // True while the user has scrolled up and a newer reply exists below.
  const [showJump, setShowJump] = useState(false);
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
  // Engine option buttons and suggested replies act only on the newest reply: an older list is no longer the one on screen.
  const lastAssistantId = [...messages].reverse().find((message) => message.role === "assistant")?.id;

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
    setShowJump(!shouldAutoScrollRef.current);
  }

  function jumpToLatest() {
    const el = chatWindowRef.current;
    if (!el) return;
    shouldAutoScrollRef.current = true;
    setShowJump(false);
    el.scrollTo({ top: el.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;

    // Scroll the chat window itself — scrollIntoView also scrolled the
    // page, pushing the selector and NEW CHAT under the mobile header.
    const el = chatWindowRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [messages, isLoading]);

  /* =======================================================
     DRAFT — the full page keeps an unsent message across
     navigation within this tab (never sent anywhere).
  ======================================================= */

  const DRAFT_KEY = "mf.dante.draft";
  const draftLoadedRef = useRef(false);

  useEffect(() => {
    if (!restoreHistory || compact) return;
    // The first run is the mount: the restore effect below reads the saved draft; don't clear it first.
    if (!draftLoadedRef.current) {
      draftLoadedRef.current = true;
      return;
    }
    try {
      if (input) window.sessionStorage.setItem(DRAFT_KEY, input);
      else window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // storage blocked
    }
  }, [input, restoreHistory, compact]);

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
      if (!compact && !ask) {
        try {
          const draft = window.sessionStorage.getItem(DRAFT_KEY);
          if (draft) setInput((current) => current || draft);
        } catch {
          // storage blocked: the draft simply isn't kept
        }
      }
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
      // URL first, then the conversation this tab last had open ("" = it was on a new chat), then today's most recent one
      // (One Day, One Thread: an older day's conversation is never reopened by default).
      const remembered = readLastThread();
      const target = fromUrl ?? (remembered === null ? todaysThread(list) : remembered || null);
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
              content: item.details ? "This proposal is still waiting for you — nothing changes until you tap Accept." : "This is still waiting for you — nothing is saved until you tap Confirm.",
              pendingConfirmation: { actionId: item.actionId, toolName: item.toolName, summary: item.summary, details: item.details ?? null },
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
    // One Day, One Thread: a chat that opened before another Dante surface (e.g. the Nutrition page) started today's thread
    // joins that thread instead of starting a parallel one — unless this tab chose "New chat" ("" remembered).
    const activeThreadId = threadId ?? (restoreHistory ? readLastThread() || crypto.randomUUID() : crypto.randomUUID());
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
          // The meal state itself is held by the server per thread (One Day, One Thread); a write refreshes food-log views.
          if (finalEvent.nutrition?.foodLogChanged) announceFoodLogChanged("dante");

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
              nutrition: finalEvent.nutrition ?? null,
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

      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; result?: { message?: unknown } };

      const resolution = resolveConfirmationOutcome(intent, { status: response.status, ok: data.ok });
      // The server's own words: the read-back result on success, the exact refusal (stale, expired, held) otherwise.
      const serverMessage = resolution === "confirmed"
        ? (typeof data.result?.message === "string" ? data.result.message : null)
        : resolution === "failed" && typeof data.error === "string" ? data.error : null;

      setMessages((previous) =>
        previous.map((message) =>
          message.id === messageId
            ? { ...message, confirmationResolution: resolution, confirmationMessage: serverMessage }
            : message
        )
      );

      // A confirmed write changed athlete data: re-render the server-built Today context (chat state is kept).
      if (resolution === "confirmed" && todayContext) router.refresh();
      // A confirmed write refreshes food-log views (the server re-validates the thread's pending log on the next turn).
      if (resolution === "confirmed") {
        announceFoodLogChanged("dante");
        window.dispatchEvent(new Event(COACH_CONTEXT_CHANGED_EVENT));
      }
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

  /* MF-S1 MODIFY: the server re-runs the proposal builder with the edited value; the card is replaced by the NEW
     proposal (still PROPOSED — Accept is a separate step). A refusal is shown on the unchanged card. */
  async function handleModifyAction(messageId: string, actionId: string, value: number) {
    setConfirmingActionId(actionId);
    try {
      const response = await fetch("/api/dante/tools/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, intent: "modify", value }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; status?: string; pending?: PendingConfirmation };
      setMessages((previous) =>
        previous.map((message) => {
          if (message.id !== messageId) return message;
          if (data.ok && data.pending) return { ...message, pendingConfirmation: data.pending, confirmationResolution: null, confirmationMessage: null };
          const handled = data.status === "already_handled" || data.status === "expired" || data.status === "not_found";
          return {
            ...message,
            confirmationResolution: handled ? (data.status === "expired" ? "expired" : "unknown") : message.confirmationResolution,
            confirmationMessage: data.error ?? "That change couldn't be prepared. Nothing was changed.",
          };
        })
      );
    } catch {
      setMessages((previous) => previous.map((message) => (message.id === messageId ? { ...message, confirmationMessage: "Couldn't reach the server. Nothing was changed." } : message)));
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
     UI — conversation first: a compact header, today's context,
     the messages, quick actions and the composer.
  ======================================================= */

  const welcome = messages[0];
  const conversation = messages.slice(1);
  const currentThread = threads.find((thread) => thread.id === threadId) ?? null;
  const fullPage = restoreHistory && !compact;
  const Heading = fullPage ? "h1" : "p";

  const threadList = (onPicked?: () => void) => (
    <ul className="space-y-1">
      {threads.length === 0 ? (
        <li className="px-2 py-2 text-sm text-mf-glass-text-muted">{isRestoring ? "Loading conversations…" : "No saved conversations yet."}</li>
      ) : null}
      {threads.map((thread) => (
        <li key={thread.id}>
          <button
            type="button"
            onClick={() => {
              onPicked?.();
              void selectThread(thread.id);
            }}
            disabled={isLoading || isRestoring}
            aria-current={thread.id === threadId ? "true" : undefined}
            className={cn(
              "flex min-h-11 w-full flex-col justify-center rounded-md px-3 py-2 text-left text-sm transition disabled:opacity-50",
              thread.id === threadId ? "bg-mf-glass-bg-deep font-semibold text-mf-glass-text" : "text-mf-glass-text-secondary hover:bg-mf-glass-hover"
            )}
          >
            <span className="w-full truncate">{thread.title}</span>
            <span className="text-xs font-normal text-mf-glass-text-muted">{new Date(thread.updatedAt).toLocaleDateString()}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <section
      aria-label={heroTitle}
      className={cn(
        // isolate: keeps the chat's internal z-layers from painting over the dashboard header.
        // mf-touch-inputs: the composer stays 16px on phones (no zoom on focus).
        "relative isolate flex w-full flex-col font-sans overflow-hidden bg-mf-glass-surface mf-touch-inputs",
        compact
          ? "h-[min(65dvh,560px)] max-h-[min(65dvh,560px)] min-h-[420px] rounded-md border border-mf-glass-border"
          // Below lg: one surface, no nested card — fits between the shell header (4rem), the page's top padding
          // (1.25rem) and the bottom nav (4.5rem) so the composer is never under the nav.
          : "max-lg:h-[calc(100dvh-9.75rem-env(safe-area-inset-bottom,0px))] max-lg:min-h-[360px] max-lg:rounded-md max-lg:border max-lg:border-mf-glass-border lg:h-[min(82dvh,860px)] lg:min-h-[580px] lg:rounded-md lg:border lg:border-mf-glass-border",
        className
      )}
    >
      <span aria-live="polite" className="sr-only">
        {DANTE_STATE_LABEL[visualState]}
      </span>

      {/* HEADER — Dante | history | new chat. */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-mf-glass-border px-3 sm:px-4">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md border border-mf-glass-dante/30 font-heading text-base font-black text-mf-glass-dante">
          D
        </span>
        <div className="min-w-0 flex-1">
          <Heading className="font-heading text-xl font-black uppercase leading-none tracking-tight text-mf-glass-text">Dante</Heading>
          {restoreHistory ? (
            <p className="mt-0.5 truncate text-xs text-mf-glass-text-muted">
              {isRestoring ? "Opening your conversation…" : currentThread?.title ?? "New conversation"}
            </p>
          ) : null}
        </div>

        {restoreHistory ? (
          <>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              aria-label="Conversation history"
              aria-haspopup="dialog"
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-md text-mf-glass-text-secondary transition hover:bg-mf-glass-hover",
                fullPage && "xl:hidden"
              )}
            >
              <History aria-hidden="true" className="size-5" />
            </button>
            <button
              type="button"
              onClick={startNewConversation}
              disabled={isLoading || isRestoring || threadId === null}
              aria-label="New chat"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold text-mf-glass-text-secondary transition hover:bg-mf-glass-hover disabled:opacity-40"
            >
              <SquarePen aria-hidden="true" className="size-5" />
              <span className="max-sm:sr-only">New chat</span>
            </button>
          </>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
      {/* CONVERSATION RAIL — full page, desktop only. */}
      {fullPage ? (
        <nav aria-label="Conversation history" className="hidden w-64 shrink-0 flex-col border-r border-mf-glass-border xl:flex">
          <p className="px-4 pb-2 pt-3 text-xs font-semibold text-mf-glass-text-muted">Conversations</p>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">{threadList()}</div>
        </nav>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {todayContext ? <TodayContextBar context={todayContext} /> : null}

      {/* CONVERSATION */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={chatWindowRef}
        onScroll={handleChatWindowScroll}
        className="h-full overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
      >
        <div className="mx-auto max-w-2xl space-y-6">
          <div>
            <p className="mb-1 text-xs font-semibold text-mf-glass-dante">Dante</p>
            <AssistantText content={welcome.content} />
            {isEmpty && heroSubtitle ? <p className="mt-2 text-sm leading-6 text-mf-glass-text-muted">{heroSubtitle}</p> : null}
          </div>

          {conversation.map((message, index) => {
            const isUser = message.role === "user";
            // One marker where the reopened history ends: replies above it describe the data as it was then.
            const earlierBoundary = restored && index === restored.count - 1;

            return (
              <React.Fragment key={message.id}>
                <div className={cn("dante-message-in flex w-full", isUser ? "justify-end" : "justify-start")}>
                  {isUser ? (
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-mf-glass-bg-deep px-4 py-2.5 text-base leading-7 text-mf-glass-text sm:max-w-[75%]">
                      <span className="sr-only">You: </span>
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  ) : (
                    <div className="flex w-full min-w-0 flex-col gap-2">
                      <p className="text-xs font-semibold text-mf-glass-dante">Dante</p>
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
                        <p className="text-sm font-semibold text-mf-glass-warning">
                          {message.historyStatus === "pending"
                            ? "This reply was never confirmed as finished — it may have been cut off by a refresh or lost connection."
                            : "This reply was interrupted before Dante finished."}
                        </p>
                      ) : null}

                      {message.notSaved ? (
                        <p className="text-sm font-semibold text-mf-glass-warning">
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
                          className="inline-flex min-h-11 items-center gap-2 self-start rounded-md border border-mf-glass-border-strong px-4 text-sm font-semibold text-mf-glass-text transition hover:bg-mf-glass-hover"
                        >
                          <RotateCcw aria-hidden="true" className="size-4" />
                          Retry
                        </button>
                      ) : null}

                      {message.nutrition?.blocks.length ? (
                        <NutritionBlocks blocks={message.nutrition.blocks} disabled={isLoading || message.id !== lastAssistantId} onPick={(text) => void sendMessage(text)} />
                      ) : null}

                      {message.nutrition?.hints.length && message.id === lastAssistantId && !isLoading ? (
                        <NutritionQuickActions actions={message.nutrition.hints.map((hint) => ({ label: hint.charAt(0).toUpperCase() + hint.slice(1), message: hint }))} disabled={isLoading} onPick={(text) => void sendMessage(text)} />
                      ) : null}

                      {message.insight ? <DanteInsightPanel insight={message.insight} /> : null}

                      {message.sources && message.sources.length > 0 ? <DanteSourcesPanel sources={message.sources} /> : null}

                      {message.pendingConfirmation?.details ? (
                        <ProposalCard
                          key={message.pendingConfirmation.actionId}
                          pendingConfirmation={message.pendingConfirmation}
                          details={message.pendingConfirmation.details}
                          resolution={message.confirmationResolution}
                          message={message.confirmationMessage}
                          isBusy={confirmingActionId === message.pendingConfirmation.actionId}
                          onConfirm={() => void handleConfirmAction(message.id, message.pendingConfirmation!.actionId, "confirm")}
                          onCancel={() => void handleConfirmAction(message.id, message.pendingConfirmation!.actionId, "cancel")}
                          onModify={(value) => void handleModifyAction(message.id, message.pendingConfirmation!.actionId, value)}
                        />
                      ) : message.pendingConfirmation ? (
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

      {showJump ? (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full border border-mf-glass-border-strong bg-mf-glass-surface px-4 text-sm font-semibold text-mf-glass-text shadow-[var(--shadow-card)]"
        >
          <ArrowDown aria-hidden="true" className="size-4" />
          Latest
        </button>
      ) : null}
      </div>

      {/* QUICK ACTIONS — real requests through the same chat pipeline, only on an empty conversation. */}
      {isEmpty && quickPrompts.length > 0 ? (
        <div role="group" aria-label="Quick actions" className="flex shrink-0 gap-2 overflow-x-auto px-3 pb-1 pt-2 [scrollbar-width:none] sm:px-4">
          {quickPrompts.slice(0, 5).map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleQuickPrompt(item.prompt)}
              disabled={isLoading}
              className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-mf-glass-border-strong bg-mf-glass-surface px-4 text-sm font-semibold text-mf-glass-text-secondary transition hover:border-mf-glass-dante/50 hover:text-mf-glass-text disabled:opacity-40"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* COMPOSER */}
      <form
        onSubmit={handleSubmit}
        className="relative flex shrink-0 items-end gap-2 border-t border-mf-glass-border px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-4"
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          aria-label="Message to Dante"
          aria-describedby={composerHintId}
          placeholder="Ask Dante…"
          className="max-h-40 min-h-11 min-w-0 flex-1 resize-none rounded-md border border-mf-glass-border-strong bg-mf-glass-surface px-3.5 py-2.5 text-base leading-6 text-mf-glass-text placeholder:text-mf-glass-text-muted focus-visible:border-mf-glass-dante"
        />
        <span id={composerHintId} className="sr-only">
          Enter sends. Shift and Enter adds a new line.
        </span>

        {/* MF-S1: voice → editable text in this box; sending stays a separate, explicit step. */}
        <DanteVoiceInput
          disabled={isLoading}
          onTranscript={(text) => {
            setInput((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text));
            textareaRef.current?.focus();
          }}
        />

        {isLoading ? (
          <button
            type="button"
            onClick={stopStreaming}
            aria-label="Stop Dante's response"
            className="flex size-11 shrink-0 items-center justify-center rounded-md border border-mf-glass-border-strong text-mf-glass-text transition hover:bg-mf-glass-hover"
          >
            <span className="size-3 rounded-[2px] bg-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send message to Dante"
            className="flex size-11 shrink-0 items-center justify-center rounded-md border border-mf-glass-text bg-mf-glass-brand text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover disabled:cursor-not-allowed disabled:border-mf-glass-border disabled:bg-mf-glass-bg-deep disabled:text-mf-glass-text-muted"
          >
            <ArrowUp aria-hidden="true" className="size-5" />
          </button>
        )}
      </form>
      </div>
      </div>

      {restoreHistory ? (
        <BottomSheet open={historyOpen} onOpenChange={setHistoryOpen} title="Conversations">
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setHistoryOpen(false);
                startNewConversation();
              }}
              disabled={isLoading || isRestoring || threadId === null}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-mf-glass-border-strong text-sm font-semibold text-mf-glass-text disabled:opacity-40"
            >
              <SquarePen aria-hidden="true" className="size-4" />
              New chat
            </button>
            {threadList(() => setHistoryOpen(false))}
          </div>
        </BottomSheet>
      ) : null}
    </section>
  );
}

const STATUS_TEXT: Record<ContextStatus, string> = {
  current: "Current",
  missing: "Not logged",
  unavailable: "Couldn't load",
  outdated: "From an earlier day",
};

function StatusDot({ status }: { status: ContextStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full border",
        status === "current" && "border-mf-glass-success bg-mf-glass-success",
        status === "missing" && "border-mf-glass-text-muted bg-transparent",
        status === "outdated" && "border-mf-glass-warning bg-transparent",
        status === "unavailable" && "border-mf-glass-warning bg-mf-glass-warning"
      )}
    />
  );
}

function formatClock(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Today's verified context (server-built in lib/dante-core/today-context.ts). Collapsed: one line of status per
 * domain; expanded: what each value is, how fresh it is, and where to fix it. A hold is always visible.
 */
function TodayContextBar({ context }: { context: DanteTodayContext }) {
  const [open, setOpen] = useState(false);
  const panelId = "dante-today-context";
  const dateLabel = context.localDate
    ? new Date(`${context.localDate}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    : null;

  return (
    <section aria-label="Today's context" className="shrink-0 border-b border-mf-glass-border px-3 py-2 sm:px-4">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold text-mf-glass-text">Today</span>
          {dateLabel ? <span className="text-mf-glass-text-muted"> · {dateLabel}</span> : null}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-semibold text-mf-glass-text-secondary hover:bg-mf-glass-hover"
        >
          {open ? "Hide context" : "View context"}
          <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        </button>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 pb-1 text-xs text-mf-glass-text-secondary" aria-label="Status by area">
        {context.items.map((item) => (
          <li key={item.id} className="inline-flex items-center gap-1.5">
            <StatusDot status={item.status} />
            <span className="font-semibold">{item.label}</span>
            <span className="text-mf-glass-text-muted max-sm:sr-only">{item.summary}</span>
            <span className="text-mf-glass-text-muted sm:sr-only">{STATUS_TEXT[item.status].toLowerCase()}</span>
          </li>
        ))}
      </ul>

      {context.holdNote ? (
        <p role="status" className="mt-1 rounded-md border border-mf-glass-warning/40 px-3 py-2 text-sm font-semibold text-mf-glass-warning">
          {context.holdNote}
        </p>
      ) : null}

      {open ? (
        <div id={panelId} className="mt-2 max-h-[38dvh] overflow-y-auto overscroll-contain pb-1">
          <ul className="divide-y divide-mf-glass-border">
            {context.items.map((item) => {
              const asOf = formatClock(item.asOf);
              return (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold text-mf-glass-text">
                      <StatusDot status={item.status} />
                      {item.label}
                      <span className="text-xs font-normal text-mf-glass-text-muted">· {STATUS_TEXT[item.status]}{asOf ? ` · updated ${asOf}` : ""}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-mf-glass-text-secondary">{item.summary}</p>
                    {item.detail ? <p className="text-sm text-mf-glass-text-muted">{item.detail}</p> : null}
                  </div>
                  <Link href={item.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-mf-glass-text underline underline-offset-4">
                    {item.linkLabel}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="pt-1 text-xs text-mf-glass-text-muted">
            Loaded {formatClock(context.loadedAt) ?? "just now"}. Dante reads your data fresh on every message; this panel refreshes when you reload or confirm a change.
          </p>
        </div>
      ) : null}
    </section>
  );
}

const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  p: ({ children }) => <p className="mb-3 text-base leading-7 text-mf-glass-text last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-3 mt-2 text-lg font-bold text-mf-glass-text">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-bold text-mf-glass-text">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-3 text-base font-semibold text-mf-glass-text">{children}</h3>,
  strong: ({ children }) => <strong className="font-semibold text-mf-glass-text">{children}</strong>,
  ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1 marker:text-mf-glass-text-muted">{children}</ul>,
  // `start` must pass through: a list interrupted by a paragraph or heading continues as <ol start="n">.
  ol: ({ children, start }) => <ol start={start} className="mb-3 ml-5 list-decimal space-y-1 marker:text-mf-glass-text-muted">{children}</ol>,
  li: ({ children }) => <li className="pl-1 text-base leading-7 text-mf-glass-text">{children}</li>,
  br: () => <br className="block content-['']" />,
  table: ({ children }) => (
    <div className="my-3 w-full overflow-x-auto rounded-xl border border-mf-glass-border">
      <table className="w-full min-w-120 border-collapse text-left text-sm tabular-nums">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-mf-glass-bg-deep text-mf-glass-text-secondary">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-mf-glass-border">{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top text-mf-glass-text">{children}</td>,
  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-mf-glass-dante/50 pl-3 text-mf-glass-text-secondary">{children}</blockquote>,
  code: ({ children }) => <code className="rounded bg-mf-glass-bg-deep px-1 py-0.5 font-mono text-sm text-mf-glass-text">{children}</code>,
  pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-md bg-mf-glass-bg-deep p-3 font-mono text-sm leading-6">{children}</pre>,
  hr: () => <hr className="my-4 border-mf-glass-border" />,
};

/** A Dante reply as plain reading text (sanitized markdown), not a card. */
const MARKDOWN_LINK: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-mf-glass-text underline underline-offset-4">
      {children}
    </a>
  ),
};

function AssistantText({ content }: { content: string }) {
  return (
    <div className="min-w-0 break-words [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]} components={{ ...MARKDOWN_COMPONENTS, ...MARKDOWN_LINK }}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
