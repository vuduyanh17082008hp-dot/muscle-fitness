import { looksVietnamese } from "@/lib/dante-language";

export type ActionStatus = "SUGGESTED" | "PENDING_CONFIRMATION" | "CONFIRMED" | "EXECUTED" | "FAILED";

const COMPLETION_CLAIM_PATTERN =
  /(?:^|[.!?]\s+|\n)(?:tôi|mình|i)\s+(?:sẽ\s+(?:tiến hành\s+)?|đã\s+|have\s+|will\s+)(?:thay đổi|cập nhật|điều chỉnh|lưu|change|update|adjust|save|modify)[^.!?\n]*/giu;

const COMPLETION_CLAIM_INLINE =
  /(?:tôi|mình|i)\s+(?:sẽ\s+(?:tiến hành\s+)?|đã\s+|have\s+|will\s+)(?:thay đổi|cập nhật|điều chỉnh|lưu|change|update|adjust|save|modify)[^.!?\n]*/giu;

const FALSE_COMPLETION_LEFTOVERS =
  /(?:^|\n)\s*(?:ngay bây giờ|ngay lập tức|right now|immediately)[.!]?\s*/giu;

/**
 * Workout-edit intent. Only EXPLICIT_MUTATION may enter the proposal path.
 * Tokens are whole words after accent-folding — "sua" does not match inside "suat".
 * ponytail: closed verb/target lists. Add a token when a real directive misses; don't stem.
 */
export type WorkoutMutationIntent =
  | "INFORMATIONAL_DISCUSSION"
  | "RECOMMENDATION_REQUEST"
  | "SIMULATION"
  | "PROPOSED_CHANGE"
  | "EXPLICIT_MUTATION";

const ACTION = new Set([
  "change", "update", "set", "switch", "replace", "move", "increase", "decrease",
  "add", "remove", "make", "adjust", "schedule", "reschedule", "modify", "edit",
  "rewrite", "save", "delete", "drop", "persist", "write",
  "doi", "sua", "dat", "chuyen", "thay", "tang", "giam", "them", "bo", "xep", "chinh", "xoa", "luu",
]);
const ADD = new Set(["add", "remove", "them", "bo", "xoa", "delete", "drop"]);
const SAVE = new Set(["save", "luu", "persist", "write"]);
const TARGET = new Set([
  "workout", "program", "plan", "session", "sessions", "schedule", "frequency", "volume",
  "exercise", "exercises", "buoi", "lich", "bai", "suat",
  "chest", "nguc", "back", "lung", "leg", "legs", "chan", "shoulder", "shoulders", "vai",
  "arm", "arms", "tay", "squat", "bench", "deadlift", "press", "pull", "push", "row",
]);
const PLAN = new Set(["workout", "program", "plan", "session", "sessions", "schedule", "buoi", "lich", "bai"]);
const DEST = new Set(["to", "thanh", "sang", "len", "vao", "xuong", "from", "onto", "on", "for", "with"]);
const UNIT = new Set(["session", "sessions", "buoi", "lan", "time", "times", "day", "days", "ngay", "week", "weeks", "tuan", "x"]);
const DAY = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const VI_DAY = new Set(["hai", "ba", "tu", "nam", "sau", "bay"]);
const SKIP = new Set(["please", "hay", "ok", "hey", "yo", "bro", "oi", "now", "ngay", "just", "giup", "toi", "minh", "ban"]);

function foldTokens(message: string): string[] {
  const folded = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return folded ? folded.split(/\s+/) : [];
}

function hasSeq(tokens: string[], seq: string[]): boolean {
  for (let i = 0; i <= tokens.length - seq.length; i += 1) {
    if (seq.every((part, j) => tokens[i + j] === part)) return true;
  }
  return false;
}

function verbAt(tokens: string[], index: number): string | null {
  if (tokens[index] === "cap" && tokens[index + 1] === "nhat") return "cap nhat";
  const token = tokens[index];
  return token && ACTION.has(token) ? token : null;
}

/** Imperative head, "want/muốn to <verb>", or a persistence verb after a prefix. */
function directiveVerb(tokens: string[]): string | null {
  let index = 0;
  if (tokens[0] === "lam" && tokens[1] === "on") index = 2;
  while (index < tokens.length && index < 3 && SKIP.has(tokens[index])) index += 1;
  const head = verbAt(tokens, index);
  if (head) return head;
  const wantAt = tokens.findIndex((token) => token === "muon" || token === "want" || token === "wanna" || token === "need");
  if (wantAt >= 0 && wantAt <= 4) {
    for (let j = wantAt + 1; j < Math.min(tokens.length, wantAt + 5); j += 1) {
      const verb = verbAt(tokens, j);
      if (verb) return verb;
    }
  }
  const forceSave = hasSeq(tokens, ["without", "asking"]) || hasSeq(tokens, ["dont", "ask"])
    || hasSeq(tokens, ["khong", "hoi"]) || hasSeq(tokens, ["dung", "confirm"]);
  if (forceSave) {
    for (let j = 0; j < tokens.length; j += 1) {
      const verb = verbAt(tokens, j);
      if (verb && SAVE.has(verb)) return verb;
    }
  }
  return null;
}

function hasTarget(tokens: string[]): boolean {
  return tokens.some((token) => TARGET.has(token)) || hasSeq(tokens, ["bai", "tap"]);
}

function hasDay(tokens: string[]): boolean {
  if (tokens.some((token) => DAY.has(token))) return true;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (tokens[i] === "thu" && VI_DAY.has(tokens[i + 1])) return true;
    if (tokens[i] === "chu" && tokens[i + 1] === "nhat") return true;
  }
  return false;
}

function hasDestination(tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i += 1) {
    if (!DEST.has(tokens[i])) continue;
    const window = tokens.slice(i + 1, i + 6);
    if (window.some((token) => /^\d+x?$/.test(token) || DAY.has(token) || UNIT.has(token) || token === "thu")) return true;
  }
  return false;
}

const FREQUENCY_WORD: Record<string, number> = {
  once: 1, one: 1, twice: 2, two: 2, thrice: 3, three: 3,
  mot: 1, hai: 2, ba: 3,
};

/** A destination frequency, not a phrase list. "once weekly" and "3 buổi/tuần" are the same shape. */
export type FrequencyIntent = { count: number; period: "week" };

export function readFrequencyIntent(message: string): FrequencyIntent | null {
  return frequencyIntent(foldTokens(message));
}

function frequencyIntent(tokens: string[]): FrequencyIntent | null {
  const linker = new Set(["per", "a", "every", "moi", "hang", "buoi", "day", "days", "time", "times", "session", "sessions", "lan"]);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (/^\d+x\d+$/.test(token)) continue;
    const isNx = /^\d+x$/.test(token);
    let count: number | null = null;
    if (isNx) count = Number(token.slice(0, -1));
    else if (/^\d+$/.test(token)) count = Number(token);
    else if (FREQUENCY_WORD[token] != null) count = FREQUENCY_WORD[token];
    if (count == null || count < 1 || count > 14) continue;
    const window = tokens.slice(i, Math.min(tokens.length, i + 6));
    const named = token === "once" || token === "twice" || token === "thrice";
    const week = window.some((item) => item === "week" || item === "weeks" || item === "tuan");
    if (window.includes("weekly") || (week && (isNx || named || window.some((item) => linker.has(item))))) {
      return { count, period: "week" };
    }
  }
  return null;
}

function hasState(tokens: string[], verb: string): boolean {
  const slot = tokens.some((token) => PLAN.has(token) || UNIT.has(token) || token === "frequency" || token === "volume" || token === "suat") || hasDay(tokens);
  if (frequencyIntent(tokens)) return true;
  if (ADD.has(verb) && hasTarget(tokens) && slot) return true;
  if (SAVE.has(verb) && tokens.some((token) => PLAN.has(token))) return true;
  if (hasDestination(tokens)) return true;
  if (tokens.some((token) => /^\d+x$/.test(token))) return true;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (tokens[i] === "so" && tokens.slice(i + 1, i + 8).includes("is")) return true;
  }
  if (tokens.some((token) => /^\d+$/.test(token)) && (tokens.some((token) => UNIT.has(token)) || hasDay(tokens))) return true;
  if (hasSeq(tokens, ["cho", "toi"]) || hasSeq(tokens, ["cho", "minh"])) return true;
  return false;
}

function isDefinition(tokens: string[]): boolean {
  return tokens.includes("mean") || tokens.includes("means") || tokens.includes("meaning")
    || tokens.includes("nghia") || hasSeq(tokens, ["la", "gi"]);
}

function isSimulation(tokens: string[]): boolean {
  if (tokens[0] === "if" || tokens[0] === "neu" || tokens[0] === "suppose" || tokens[0] === "supposing") return true;
  if (hasSeq(tokens, ["what", "if"]) || hasSeq(tokens, ["what", "happens"]) || hasSeq(tokens, ["what", "would"])) return true;
  if (hasSeq(tokens, ["gia", "su"])) return true;
  return hasSeq(tokens, ["thi", "sao"]) && (tokens.includes("neu") || tokens.includes("if"));
}

/** Advice-seeking. "Would you <verb>" is not this — that is a polite directive. */
function isHardRecommendation(tokens: string[]): boolean {
  if (tokens[0] === "should" || hasSeq(tokens, ["should", "i"])) return true;
  if (hasSeq(tokens, ["co", "nen"]) || hasSeq(tokens, ["co", "tot", "khong"]) || hasSeq(tokens, ["tot", "hon"])) return true;
  if (hasSeq(tokens, ["be", "better"]) || hasSeq(tokens, ["it", "better"])) return true;
  if (hasSeq(tokens, ["do", "you", "think"]) || hasSeq(tokens, ["think", "about"])) return true;
  if (tokens.includes("recommend")) return true;
  return false;
}

/**
 * can/could/would + you + verb, or Vietnamese bạn có thể / bạn + verb / cho tôi + verb.
 * The verb has to be the action itself, not a gerund and not "explain"/"compare".
 */
function politeVerb(tokens: string[]): string | null {
  const aux = new Set(["can", "could", "would"]);
  for (let i = 0; i < tokens.length - 2; i += 1) {
    if (!aux.has(tokens[i]) || tokens[i + 1] !== "you") continue;
    const immediate = verbAt(tokens, i + 2);
    if (immediate) return immediate;
    if (SKIP.has(tokens[i + 2])) {
      const later = verbAt(tokens, i + 3);
      if (later) return later;
    }
  }
  for (let i = 0; i < tokens.length - 3; i += 1) {
    if (tokens[i] === "ban" && tokens[i + 1] === "co" && tokens[i + 2] === "the") {
      const verb = verbAt(tokens, i + 3);
      if (verb) return verb;
    }
  }
  if (tokens[0] === "ban") {
    const verb = verbAt(tokens, 1);
    if (verb) return verb;
  }
  for (let i = 0; i < tokens.length - 2; i += 1) {
    if ((tokens[i] !== "cho" && tokens[i] !== "giup") || (tokens[i + 1] !== "toi" && tokens[i + 1] !== "minh")) continue;
    for (let j = i + 2; j < Math.min(tokens.length, i + 5); j += 1) {
      const verb = verbAt(tokens, j);
      if (verb) return verb;
    }
  }
  return null;
}

function isComparison(tokens: string[]): boolean {
  return tokens.includes("compare") || tokens.includes("vs") || hasSeq(tokens, ["so", "sanh"]);
}

function isHedge(tokens: string[]): boolean {
  return tokens.includes("maybe") || tokens.includes("perhaps") || tokens.includes("might") || hasSeq(tokens, ["co", "le"]);
}

function isQuestion(message: string, tokens: string[]): boolean {
  if (/\?\s*$/.test(message.trim())) return true;
  const first = tokens[0];
  if (["what", "how", "why", "when", "which", "who", "where", "con", "is", "are", "do", "does", "did", "can"].includes(first ?? "")) {
    return true;
  }
  const last = tokens[tokens.length - 1];
  return last === "sao" || last === "khong";
}

function clauseExplicit(tokens: string[]): boolean {
  const verb = directiveVerb(tokens);
  return Boolean(verb && hasTarget(tokens) && hasState(tokens, verb));
}

export function classifyWorkoutMutationIntent(message: string): WorkoutMutationIntent {
  const tokens = foldTokens(message);
  if (tokens.length === 0) return "INFORMATIONAL_DISCUSSION";
  if (isDefinition(tokens)) return "INFORMATIONAL_DISCUSSION";
  if (isSimulation(tokens)) return "SIMULATION";
  if (isHardRecommendation(tokens)) return "RECOMMENDATION_REQUEST";
  const polite = politeVerb(tokens);
  if (polite && hasTarget(tokens) && hasState(tokens, polite)) return "EXPLICIT_MUTATION";
  if (isComparison(tokens)) return "INFORMATIONAL_DISCUSSION";
  if (tokens[0] === "would" || tokens[0] === "could") return "RECOMMENDATION_REQUEST";
  const verb = directiveVerb(tokens);
  if (isHedge(tokens)) return verb ? "PROPOSED_CHANGE" : "INFORMATIONAL_DISCUSSION";
  if (isQuestion(message, tokens)) return verb ? "PROPOSED_CHANGE" : "INFORMATIONAL_DISCUSSION";
  const clauses = message.split(/[.!\n]+/).map((part) => foldTokens(part)).filter((part) => part.length > 0);
  if (clauses.some(clauseExplicit)) return "EXPLICIT_MUTATION";
  if (verb && hasTarget(tokens)) return "PROPOSED_CHANGE";
  if (hasTarget(tokens) && (tokens.some((token) => /^\d+x?$/.test(token)) || hasDay(tokens))) return "PROPOSED_CHANGE";
  return "INFORMATIONAL_DISCUSSION";
}

export function isWorkoutMutationRequest(message: string): boolean {
  return classifyWorkoutMutationIntent(message) === "EXPLICIT_MUTATION";
}

/** The message's own language wins over a session that started in the other language. */
export function proposalLanguage(message: string, sessionLanguage: "en" | "vi"): "en" | "vi" {
  return looksVietnamese(message) ? "vi" : sessionLanguage;
}

/**
 * "3x" alone is not a frequency. Sets/reps ("3x10") and an explicit week
 * ("3x per week") are decided. A bare "3x" inside a question is ambiguous.
 */
export function needsTrainingCountClarification(message: string): boolean {
  const tokens = foldTokens(message);
  if (frequencyIntent(tokens)) return false;
  if (tokens.some((token) => /^\d+x\d+$/.test(token))) return false;
  if (!tokens.some((token) => /^\d+x$/.test(token))) return false;
  if (isWorkoutMutationRequest(message)) return false;
  return isQuestion(message, tokens) || isHardRecommendation(tokens) || tokens[0] === "would" || tokens[0] === "could";
}

export function trainingCountClarification(language: "en" | "vi"): string {
  return language === "vi"
    ? "3x ở đây chưa rõ. Ông muốn nói 3 hiệp, hay 3 buổi mỗi tuần?"
    : "3x is ambiguous here. Do you mean 3 sets, or 3 sessions per week?";
}

export function resolveActionStatus(input: {
  pendingConfirmation: unknown;
  executedWrite?: boolean;
  failed?: boolean;
}): ActionStatus {
  if (input.failed) return "FAILED";
  if (input.executedWrite) return "EXECUTED";
  if (input.pendingConfirmation) return "PENDING_CONFIRMATION";
  return "SUGGESTED";
}

function scrubFalseCompletionClaims(reply: string): string {
  return reply
    .replace(COMPLETION_CLAIM_PATTERN, (match, offset: number) => (offset === 0 ? "" : match[0] === "\n" ? "\n" : ". "))
    .replace(COMPLETION_CLAIM_INLINE, "")
    .replace(FALSE_COMPLETION_LEFTOVERS, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[.\s]+/, "")
    .replace(/\s+\./g, ".")
    .trim();
}

export function guardActionResponse(
  reply: string,
  status: ActionStatus,
  language: "en" | "vi",
): string {
  if (status === "EXECUTED" || status === "CONFIRMED") return reply;

  const cleaned = status === "SUGGESTED" || status === "FAILED"
    ? scrubFalseCompletionClaims(reply)
    : reply;

  if (status === "PENDING_CONFIRMATION") {
    const scrubbedPending = scrubFalseCompletionClaims(cleaned);
    if (/(?:confirm|confirmation|xác nhận|xac nhan|cancel|hủy|huy)/i.test(scrubbedPending)) {
      return scrubbedPending;
    }
    return language === "vi"
      ? `${scrubbedPending}\n\nThay đổi này đang chờ xác nhận; chưa có gì được lưu.`
      : `${scrubbedPending}\n\nThis change is pending confirmation; nothing has been saved yet.`;
  }

  if (status === "FAILED") {
    const failNotice = language === "vi"
      ? "Yêu cầu thay đổi chưa được thực hiện."
      : "The requested change was not completed.";
    return cleaned ? `${failNotice}\n\n${cleaned}` : failNotice;
  }

  const notice = language === "vi"
    ? "Đây mới chỉ là đề xuất thay đổi. Tôi chưa thay đổi chương trình tập đã lưu của bạn. Sửa lịch trực tiếp trong cuộc trò chuyện này chưa được bật."
    : "This is only a proposed change. I haven't changed your saved program. Direct plan editing from this chat isn't enabled yet.";
  return cleaned ? `${notice}\n\n${cleaned}` : notice;
}

/* ------------------------------------------------------------------ */
/* H0 cluster C — MODEL_SAYS_SUCCESS != MUTATION_SUCCESS               */
/* ------------------------------------------------------------------ */

const MUTATION_VERB = "(?:logged|saved|recorded|added|updated|scheduled|stored|applied|changed|deleted|removed|booked|set up|entered|tracked|registered|confirmed)";
// A claim that THIS turn changed the user's records, or that a change is in progress. Past reads ("your log shows…",
// "were logged this morning") are not claims; negated sentences ("nothing has been saved") never match (checked per sentence).
// The user's records: what a write could have touched.
const RECORD_CONTEXT = /\b(?:log|logs|logged|logging|diary|profile|records?|plan|schedule\w*|calendar|workout|session|meals?|entry|entries|weight|bodyweight|breakfast|lunch|dinner|snacks?|food|check-?in|eggs?|banana|chicken|rice|toast|yogurt|shake|nutrition|macros|leg day|chest day|tracker)\b|nhật ký|hồ sơ|bữa|lịch|cân nặng/iu;
const ALWAYS_FAKE: RegExp[] = [
  /^\s*(?:logging|saving|adding|recording|updating|scheduling|searching for|looking up)\b[^.!?\n]*\b(?:now|for you)\b/i,
  /^\s*(?:confirmed|done|all set|logged|saved)\s*[.!]?\s*$/i,
  /^\s*(?:logged|saved|added|recorded|scheduled|updated)\s+(?:\d|your|it|that|the|a|an|two|three|four|five)\b/i,
  /\b(?:please\s+)?hold on(?: for)? a (?:moment|sec\w*)\b|\bone moment(?: please)?\b/i,
];
const MUTATION_CLAIMS: RegExp[] = [
  new RegExp(`\\b(?:has|have)\\s+(?:now\\s+|successfully\\s+|already\\s+)?been\\s+(?:successfully\\s+)?${MUTATION_VERB}\\b`, "i"),
  new RegExp(`\\b(?:i|i'?ve|i have|we'?ve|we have|dante has)\\s+(?:just\\s+|now\\s+|successfully\\s+|already\\s+)?${MUTATION_VERB}\\b`, "i"),
  new RegExp(`\\b(?:is|are)\\s+now\\s+(?:${MUTATION_VERB}|noted|set|in your (?:log|profile|plan|diary))\\b|\\bnow\\s+(?:${MUTATION_VERB}|noted)\\s+as\\b|\\b(?:is|are|has been|have been)\\s+(?:noted|recorded|saved|logged)\\s+as\\s+\\d`, "i"),
  new RegExp(`\\b${MUTATION_VERB}\\s+(?:successfully|for you)\\b`, "i"),
  // H1-LOG-01: "I'll proceed to log this for you" promised an execution no tool was running. Closed filler list, not a parser.
  /\b(?:i'?m|i am|i'?ll|i will|let me|i'?m going to|i am going to)\s+(?:(?:now|just|then|also|quickly|gladly|happily|right away|go ahead and|proceed to|proceed and|start|be|get (?:that|this|it|them|those))\s+){0,2}(?:logging|saving|adding|recording|updating|scheduling|log|save|add|record|update|schedule|logged|saved|added|recorded|updated|scheduled)\b(?![^.!?\n]*\b(?:once|when|after|if) you confirm)/i,
  /^\s*(?:logging|saving|adding|recording|updating|scheduling|searching for|looking up)\b[^.!?\n]*\b(?:now|for you)\b/i,
  /\b(?:proceeding|going ahead) (?:to|and|with)\s+(?:log|save|add|record|update|schedul)\w*/i,
  // A promised or in-progress mutation is a claim too: "Leg day will be scheduled for tomorrow", "please hold on".
  new RegExp(`\\b(?:will be|is being|are being|gets?|is going to be)\\s+${MUTATION_VERB}\\b(?![^.!?\\n]*\\b(?:once|when|after|if) you confirm)`, "i"),
  /\b(?:please\s+)?hold on(?: for)? a (?:moment|sec\w*)\b|\bone moment(?: please)?\b|\b(?:let me|let's|i'?ll)\s+(?:quickly\s+)?(?:look (?:that |it |this )?up|check (?:that|the database)|search (?:for|the database)|pull (?:that|it) up|find the (?:macros|nutrition))\b/i,
  /^\s*(?:confirmed|done|all set|logged|saved)\s*[.!]?\s*$/i,
  /^\s*(?:logged|saved|added|recorded|scheduled|updated)\s+(?:\d|your|it|that|the|a|an|two|three|four|five)\b/i,
  // Vietnamese: JS \b is ASCII-only, so letter boundaries are explicit (\p{L}).
  /(?<!\p{L})(?:đã|vừa)\s+(?:ghi(?:\s+nhận|\s+lại)?|lưu|cập nhật|thêm|đặt lịch|xác nhận)(?!\p{L})|(?<!\p{L})đang\s+(?:ghi|lưu|thêm|cập nhật)(?!\p{L})|(?<!\p{L})xong rồi(?!\p{L})/iu,
];
// An ask to confirm an action ("please confirm", "you can confirm the addition", "tap Confirm") — not "confirm with your doctor".
const CONFIRM_ASK = /\b(?:please|just|you can|simply|tap|press|click|go ahead and)\s+(?:\w+\s+)?confirm\b(?![^.!?\n]{0,30}\b(?:with|by)\s+(?:your|a|an)\s+(?:doctor|physio\w*|allergist|clinician|dietitian|gp|healthcare))/i;
// "Side effects have been recorded in trials" reports evidence, not a change to the user's records.
const EVIDENCE_TALK = /\b(?:stud(?:y|ies)|trials?|research|evidence|literature|cases?|reported in|observed|meta-analys\w*|guidelines?|nghiên cứu|bằng chứng)\b/iu;
const MUTATION_NEGATED =/\b(?:not|n't|nothing|never|no\s+(?:change|record|log)|haven'?t|hasn'?t|won'?t|until|once you|after you|if you|chưa|không|chua|khong)\b/iu;

/**
 * The only proof of a mutation is a backend receipt. Without one (`receipt === false`), every sentence that claims a
 * change was made or is being made is removed and one truthful status line is added. With a pending confirmation the line
 * says it is waiting; otherwise that nothing changed. Removal plus one fixed line — it never invents a result.
 */
export function guardMutationClaims(reply: string, input: { receipt: boolean; pending: boolean; language: "en" | "vi" }): string {
  if (input.receipt) return reply;
  let removed = false;
  const kept = reply
    .split("\n")
    .map((line) => {
      const parts = line.split(/(?<=[.!?])\s+/);
      const keep = parts.filter((sentence) => {
        // A generic verb ("has been added", "is now set") is a mutation claim only about the user's records; the always-fake
        // forms ("Confirmed.", "Logging … now", "please hold on", "Logged 3 eggs.") need no context (H0: D05 false positive).
        const fake = ALWAYS_FAKE.some((re) => re.test(sentence));
        const claims = ((fake || (MUTATION_CLAIMS.some((re) => re.test(sentence)) && RECORD_CONTEXT.test(sentence))) && !MUTATION_NEGATED.test(sentence) && !EVIDENCE_TALK.test(sentence))
          // H1-LM (X10): "please confirm, and I can assist" with nothing pending promises a confirmation that does not exist.
          // A status read back from the stored action ("still waiting for you to tap Confirm") is grounded, not a promise.
          || (!input.pending && CONFIRM_ASK.test(sentence) && !/\b(?:waiting|pending|still)\b/i.test(sentence));
        if (claims) removed = true;
        return !claims;
      });
      return keep.join(" ");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!removed) return reply;
  const status = input.pending
    ? input.language === "vi" ? "Thao tác này đang chờ bạn xác nhận; chưa có gì được lưu cho đến khi bạn xác nhận." : "This is waiting for your confirmation — nothing is saved until you confirm."
    : input.language === "vi" ? "Chưa có gì được ghi hay lưu vào dữ liệu của bạn — mình chỉ thay đổi dữ liệu qua một thao tác bạn xác nhận." : "Nothing has been logged or saved to your records — I only change them through an action you confirm.";
  return kept ? `${status}\n\n${kept}` : status;
}

/** Deterministic proposal. No confirm button exists until a writer does, so the copy must not ask for one. */
export function buildSuggestedWorkoutChangeReply(language: "en" | "vi", request?: string): string {
  const asked = request?.trim().replace(/\s+/g, " ");
  const body = asked ? (language === "vi" ? `Yêu cầu: ${asked}` : `You asked: ${asked}`) : "";
  return guardActionResponse(body, "SUGGESTED", language);
}
