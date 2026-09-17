/**
 * Dante's response-language policy — provider-neutral, single source
 * of truth for which language Dante's final user-facing response
 * should be written in. Deterministic detection (no LLM call, no
 * heavy language-ID library) feeding a short, explicit prompt
 * instruction: this module decides WHICH language to ask for and
 * why; the model still writes the actual prose.
 *
 * Replaces a prior version of this file that hard-forced English
 * regardless of the user's own language — that policy is gone. Dante
 * now adapts to the user's current conversational language (see
 * decideDanteLanguage below for the exact priority order).
 */

export type DanteLanguageSource =
  | "explicit_request"
  | "conversation"
  | "message"
  | "stored_preference"
  | "fallback";

export type DanteLanguageConfidence = "high" | "medium" | "low";

export type DanteLanguageDecision = {
  /** Short code Dante is instructed to answer in, e.g. "en", "vi". */
  language: string;
  /** Human-readable name for the prompt, e.g. "English", "Vietnamese". */
  languageName: string;
  source: DanteLanguageSource;
  confidence: DanteLanguageConfidence;
};

const ENGLISH: Omit<DanteLanguageDecision, "source" | "confidence"> = { language: "en", languageName: "English" };
const VIETNAMESE: Omit<DanteLanguageDecision, "source" | "confidence"> = { language: "vi", languageName: "Vietnamese" };

/** A temporary request ("answer this in English") — matched narrowly so it doesn't fire on ordinary sentences that merely contain the word "English"/"Vietnamese". */
const EXPLICIT_ENGLISH_REQUEST: RegExp[] = [
  /\b(answer|reply|respond|explain|write|say)\b[^.!?]{0,20}\bin\s+english\b/i,
  /\benglish\s+please\b/i,
  /\bswitch\s+(back\s+)?to\s+english\b/i,
  /\buse\s+english\b/i,
  /\bactually,?\s+(answer|reply|respond)\b[^.!?]{0,20}\benglish\b/i,
];

const EXPLICIT_VIETNAMESE_REQUEST: RegExp[] = [
  /tr[aả]\s*l[oờ][iì]\s*b[ằă]ng\s*ti[eế]ng\s*vi[eệ]t/i,
  /\b(answer|reply|respond|explain|write|say)\b[^.!?]{0,20}\bin\s+vietnamese\b/i,
  /\bvietnamese\s+please\b/i,
  /chuy[eể]n\s*sang\s*ti[eế]ng\s*vi[eệ]t/i,
  /quay\s*l[aạ]i\s*ti[eế]ng\s*vi[eệ]t/i,
  /n[oó]i\s*ti[eế]ng\s*vi[eệ]t/i,
  /d[uù]ng\s*ti[eế]ng\s*vi[eệ]t/i,
];

/** Precomposed Vietnamese-only vowels (Latin Extended Additional) — this range is not shared with French/Spanish/Portuguese/German, so a match here is a reliable, low-false-positive Vietnamese signal without a language-ID library. */
const VIETNAMESE_SPECIFIC_VOWELS = /[Ạ-ỹ]/;
/** đ/Đ alone is common enough elsewhere (e.g. Croatian) that it's only used together with a common Vietnamese function word, never alone. */
const VIETNAMESE_DJ = /[đĐ]/;
const VIETNAMESE_COMMON_WORDS =
  /\b(t[oô]i|b[aạ]n|c[uủ]a|kh[oô]ng|v[aà]|l[aà]|h[oô]m\s*nay|n[eê]n|đư[oợ]c|cho|v[oớ]i|n[aà]y|nh[uữ]ng|m[oộ]t|c[aá]c|c[oó]|đang|s[eẽ]|đ[aã]|t[aậ]p|gi[oờ]|mu[oố]n)\b/i;

function matchesAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Lightweight, deterministic Vietnamese detector. Diacritic ranges are
 * essentially unambiguous for realistic chat-length text; the
 * function-word check exists only to disambiguate a bare "đ" from
 * unrelated Latin-Extended text.
 */
export function looksVietnamese(text: string): boolean {
  if (VIETNAMESE_SPECIFIC_VOWELS.test(text)) return true;
  if (VIETNAMESE_DJ.test(text) && VIETNAMESE_COMMON_WORDS.test(text)) return true;
  return false;
}

export type DecideDanteLanguageInput = {
  /** The client's current message — always the primary day-to-day signal. */
  currentMessage: string;
  /**
   * Up to a few of the client's most recent prior messages
   * (oldest-to-newest order doesn't matter here), used ONLY as a
   * fallback when the current message itself is too short/ambiguous
   * to carry a language signal on its own (e.g. "ok", "150g", a bare
   * number). A clear signal in the current message always wins over
   * conversation history — see decideDanteLanguage's own comment.
   */
  recentMessages?: string[];
  /**
   * A genuinely persisted, previously-confirmed language preference,
   * if the caller has one. Phase 1 does not add any new persistence
   * for this — omit it unless a real verified store already exists.
   */
  storedPreference?: "en" | "vi" | null;
};

/**
 * Priority order: (1) an explicit request in the CURRENT message, (2)
 * a clear language signal in the CURRENT message, (3) recent
 * conversation language — used only when the current message gave no
 * signal (e.g. it's a bare number or very short), (4) a verified
 * stored preference, (5) English fallback.
 *
 * A temporary explicit request ("answer this in English") never
 * mutates anything persisted — it's evaluated fresh on every call
 * from the current message alone, so the very next message reverts
 * to whatever it itself signals.
 */
export function decideDanteLanguage(input: DecideDanteLanguageInput): DanteLanguageDecision {
  const { currentMessage, recentMessages = [], storedPreference = null } = input;

  if (matchesAny(EXPLICIT_ENGLISH_REQUEST, currentMessage)) {
    return { ...ENGLISH, source: "explicit_request", confidence: "high" };
  }
  if (matchesAny(EXPLICIT_VIETNAMESE_REQUEST, currentMessage)) {
    return { ...VIETNAMESE, source: "explicit_request", confidence: "high" };
  }

  if (currentMessage.trim().length > 0) {
    if (looksVietnamese(currentMessage)) {
      return { ...VIETNAMESE, source: "message", confidence: "high" };
    }

    // The current message has real content and no Vietnamese signal —
    // treat it as English rather than falling back to older
    // conversation turns, so a client who switches languages
    // mid-conversation is followed immediately.
    if (currentMessage.trim().length >= 8) {
      return { ...ENGLISH, source: "message", confidence: "medium" };
    }
  }

  const recentVietnamese = recentMessages.slice(-3).some(looksVietnamese);
  if (recentVietnamese) {
    return { ...VIETNAMESE, source: "conversation", confidence: "medium" };
  }

  if (storedPreference === "vi") {
    return { ...VIETNAMESE, source: "stored_preference", confidence: "medium" };
  }
  if (storedPreference === "en") {
    return { ...ENGLISH, source: "stored_preference", confidence: "medium" };
  }

  return { ...ENGLISH, source: "fallback", confidence: "low" };
}

function languageSourceLabel(source: DanteLanguageSource): string {
  switch (source) {
    case "explicit_request":
      return "the client's explicit request in this message";
    case "conversation":
      return "the language of the recent conversation";
    case "message":
      return "the language of the client's current message";
    case "stored_preference":
      return "the client's stored language preference";
    case "fallback":
      return "no clear language signal in this message";
  }
}

/**
 * The single prompt block every Dante response path (legacy Q&A,
 * agent tool loop) should inject — do not write a second, divergent
 * language instruction elsewhere.
 */
export function buildDanteLanguageInstruction(decision: DanteLanguageDecision): string {
  return `
============================================================
RESPONSE LANGUAGE
============================================================

Write the ENTIRE final user-facing answer in ${decision.languageName}.

This was determined from ${languageSourceLabel(decision.source)} — it
is the client's current conversational language, not a fixed default.
If a LATER message in this same conversation asks for a different
language, follow that for its reply; a temporary request to switch
does not permanently replace the client's usual language.

Keep these unchanged regardless of response language:
- established exercise names (e.g. Bench Press, Romanian Deadlift,
  Lat Pulldown, Lateral Raise, Barbell Row) — never translate them.
- standard sports-science terms may stay in English inline where that
  reads naturally (RIR, RPE, volume, intensity, recovery, adherence,
  training load) — do not force an awkward literal translation of
  every technical term.

Do not switch response language merely because retrieved evidence,
citations, or stored profile/preference text happens to be in a
different language than ${decision.languageName}.
============================================================
`.trim();
}
