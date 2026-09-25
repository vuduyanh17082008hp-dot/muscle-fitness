import { normalizeSafetyText } from "@/lib/dante-core/safety-layer";
import { extractCurrentTurnState } from "@/lib/dante-core/current-turn-state";
import { normalizeBodyRegion } from "@/lib/dante-core/risk-accumulator/body-region";
import type {
  RiskHistoryTurn,
  RiskRawObservation,
} from "@/lib/dante-core/risk-accumulator/types";

function hashSessionKey(message: string, index: number): string {
  // One user turn → one session event id (prevents paraphrase amplification).
  return `turn:${index}:${message.trim().slice(0, 80).toLowerCase().replace(/\s+/g, "_")}`;
}

function isDomsLanguage(text: string): boolean {
  return (
    /(?:sore|doms|mo\s+co|mo\s+dui|quads?\s+sore|legs?\s+are\s+sore|sau\s+leg\s+day|after\s+leg\s+day)/i.test(
      text,
    ) && !/(?:pinch|pinching|irritat|can|kho\s+chiu|off\s+when|hurts?\s+during|pain\s+during)/i.test(text)
  );
}

function isIrritationLanguage(text: string): boolean {
  // Avoid bare English modal "can". After VI diacritic strip, "cấn" → "can"
  // and is matched via lai/hoi/can khi|luc or region-linked patterns.
  return /(?:irritat|pinch|pinching|kho\s+chiu|feels?\s+(?:a\s+)?(?:bit\s+|little\s+)?off|uncomfortable|hurts?\s+during|pain\s+during|lai\s+can|hoi\s+can|\bcan\s+(?:khi|luc|overhead|vai)|(?:vai|shoulder).{0,40}\bcan\b|\bagain\b.{0,30}(?:irritat|pinch|can|off)|(?:irritat|pinch|can|off).{0,30}\bagain\b)/i.test(
    text,
  );
}

function parseBenchLoadKg(text: string): number | null {
  const match = text.match(
    /\b(?:bench(?:\s*press)?|ohp|overhead\s+press)\b[^\d]{0,20}(\d+(?:\.\d+)?)\s*kg\b|\b(\d+(?:\.\d+)?)\s*kg\b[^\n]{0,20}\b(?:bench|ohp)\b/i,
  );
  if (!match) return null;
  const value = Number(match[1] ?? match[2]);
  return Number.isFinite(value) ? value : null;
}

function parseSquatLoadKg(text: string): number | null {
  const match = text.match(/\b(?:squat)\b[^\d]{0,20}(\d+(?:\.\d+)?)\s*kg\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function isTrustedIsoTimestamp(value: string | null | undefined): value is string {
  if (!value || typeof value !== "string") return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

/**
 * Extract at most one observation of each kind from a single user turn.
 * Assistant restatements are never passed here.
 */
export function observeFromUserMessage(
  message: string,
  input: {
    observedAt: string | null;
    timestampTrusted: boolean;
    index: number;
    source?: RiskRawObservation["source"];
  },
): RiskRawObservation[] {
  const text = normalizeSafetyText(message);
  const state = extractCurrentTurnState(message);
  const region = normalizeBodyRegion(message);
  const sessionKey = hashSessionKey(message, input.index);
  const source = input.source ?? "CURRENT_USER_REPORT";
  const observedAt = input.timestampTrusted && isTrustedIsoTimestamp(input.observedAt)
    ? input.observedAt
    : null;
  const timestampTrusted = Boolean(observedAt);
  const out: RiskRawObservation[] = [];

  if (state.shoulderIrritationResolved || /(?:pain-?free|hoan\s+toan\s+het|hoan\s+toan\s+on|symptom-?free|khong\s+co\s+trieu\s+chung)/i.test(text)) {
    out.push({
      id: `${sessionKey}:resolution`,
      kind: "SYMPTOM_FREE_RESOLUTION",
      observedAt,
      timestampTrusted,
      source,
      bodyRegion: region ?? (state.shoulderIrritationResolved ? "SHOULDER_UNSPECIFIED" : undefined),
      sessionKey,
    });
  }

  if (state.shoulderIrritated || (region && isIrritationLanguage(text) && !isDomsLanguage(text) && !state.shoulderIrritationResolved)) {
    // Historical-only uncertain recall must not become a current IRRITATION observation.
    const historicalOnly =
      /(?:thang truoc|tuan truoc|last month|last week|\bhom qua\b|(?<!before )\byesterday\b).{0,60}(?:vai|shoulder).{0,40}(?:dau|pain|can|kich ung|irritat)|(?:vai|shoulder).{0,40}(?:thang truoc|tuan truoc|last month|last week|\bhom qua\b|(?<!before )\byesterday\b).{0,40}(?:dau|pain|can|kich ung|irritat)/i.test(text)
      && !/(?:hien tai|currently|right now|bay gio|hom nay|today|still|van).{0,40}(?:dau|pain|can|kich ung|irritat|uncomfortable)/i.test(text);
    if (!historicalOnly && !isDomsLanguage(text)) {
      out.push({
        id: `${sessionKey}:irritation`,
        kind: "IRRITATION",
        observedAt,
        timestampTrusted,
        source,
        // Never invent laterality when CURRENT_STATE only says "shoulder".
        bodyRegion: region ?? (state.shoulderIrritated ? "SHOULDER_UNSPECIFIED" : "OTHER"),
        sessionKey,
      });
    }
  } else if (isDomsLanguage(text)) {
    out.push({
      id: `${sessionKey}:doms`,
      kind: "DOMS",
      observedAt,
      timestampTrusted,
      source,
      bodyRegion: region ?? "QUADS",
      sessionKey,
    });
  }

  if (state.recoveryStatus === "POOR" || (state.recoveryScore != null && state.recoveryScore <= 50)) {
    out.push({
      id: `${sessionKey}:low_recovery`,
      kind: "LOW_RECOVERY",
      observedAt,
      timestampTrusted,
      source,
      recoveryScore: state.recoveryScore,
      recoveryStatus: state.recoveryStatus,
      sessionKey,
    });
  }

  // Explicit "several sessions below normal" report counts as a fatigue-relevant event.
  if (/(?:ba\s+buoi|3\s+buoi|three\s+sessions|several\s+sessions).{0,40}(?:recovery|thap|low|below)/i.test(text)) {
    out.push({
      id: `${sessionKey}:fatigue_report`,
      kind: "LOW_RECOVERY",
      observedAt,
      timestampTrusted,
      source,
      recoveryStatus: "POOR",
      sessionKey,
    });
  }

  const benchKg = parseBenchLoadKg(text);
  if (benchKg != null) {
    out.push({
      id: `${sessionKey}:load_bench`,
      kind: "LOAD_POINT",
      observedAt,
      timestampTrusted,
      source: source === "CURRENT_USER_REPORT" ? "CURRENT_USER_REPORT" : source,
      movementFamily: /ohp|overhead/i.test(text) ? "OHP" : "BENCH",
      loadKg: benchKg,
      // Load family relevance uses shoulder region class — still unspecified laterality.
      bodyRegion: "SHOULDER_UNSPECIFIED",
      sessionKey,
    });
  }

  const squatKg = parseSquatLoadKg(text);
  if (squatKg != null) {
    out.push({
      id: `${sessionKey}:load_squat`,
      kind: "LOAD_POINT",
      observedAt,
      timestampTrusted,
      source,
      movementFamily: "SQUAT",
      loadKg: squatKg,
      bodyRegion: "OTHER",
      sessionKey,
    });
  }

  return out;
}

function normalizeHistoryTurns(
  turns: Array<string | RiskHistoryTurn>,
): RiskHistoryTurn[] {
  return turns.map((turn) =>
    typeof turn === "string" ? { content: turn, observedAt: null } : turn,
  );
}

/**
 * Rebuild raw observations from active-chat user turns.
 *
 * Uses real timestamps when provided. Does NOT fabricate 1-day spacing.
 * The optional `currentTurnObservedAt` marks the final turn as trusted
 * when that turn itself lacks metadata (request-time clock).
 */
export function deriveObservationsFromHistory(
  userMessagesChronological: Array<string | RiskHistoryTurn>,
  options: {
    now?: Date;
    /** Trusted clock for the final turn when that turn has no message timestamp. */
    currentTurnObservedAt?: string | null;
  } = {},
): RiskRawObservation[] {
  const turns = normalizeHistoryTurns(userMessagesChronological);
  const observations: RiskRawObservation[] = [];
  const seenSessionKeys = new Set<string>();
  const lastIndex = turns.length - 1;

  turns.forEach((turn, index) => {
    if (!turn.content.trim()) return;

    let observedAt: string | null = null;
    let timestampTrusted = false;

    if (isTrustedIsoTimestamp(turn.observedAt ?? null)) {
      observedAt = turn.observedAt!;
      timestampTrusted = true;
    } else if (
      index === lastIndex &&
      isTrustedIsoTimestamp(options.currentTurnObservedAt ?? null)
    ) {
      // Current request clock only — never backfill prior turns.
      observedAt = options.currentTurnObservedAt!;
      timestampTrusted = true;
    }

    const batch = observeFromUserMessage(turn.content, {
      observedAt,
      timestampTrusted,
      index,
    });
    for (const item of batch) {
      if (seenSessionKeys.has(item.id)) continue;
      seenSessionKeys.add(item.id);
      observations.push(item);
    }
  });

  return observations;
}
