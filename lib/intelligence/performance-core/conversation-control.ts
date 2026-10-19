import { isInsult } from "@/lib/intelligence/query-understanding/classify";
import { inferVerbosityPreference } from "@/lib/dante-core/coherence/style";

import { fold, hasTerm, tokens } from "./text";
import type { AssistantFeedback, ControlTone, ControlVerbosity, ConversationControl } from "./types";

/**
 * Conversation Control (ICH-1) — resolved at PIPELINE level, before domain routing, for both coaches.
 *
 *   SAFETY > EXPLICIT CURRENT-TURN CONTROL > USER CORRECTION > DOMAIN INTENT > CONVERSATIONAL CONTEXT > PERSONA
 *
 * Safety is not decided here: callers pass `safetyActive` and every feedback/correction reading is dropped when it is
 * set, so a genuine safety turn can never be reclassified as "the user is just annoyed". Persona and domain prompts
 * CONSUME this state; neither may overwrite it.
 *
 * These are structural detectors (a language name in a directive-shaped message, an addressee plus an evaluation), not a
 * list of known sentences. `detectExplicitLanguageRequest` is the ONLY explicit-language detector in the codebase:
 * lib/dante-language.ts and lib/dante-core/coherence/analysis.ts both call it.
 */

const LANGUAGE_NAMES: Array<["EN" | "VI", string[]]> = [
  ["EN", ["english", "tieng anh", "anh ngu", "eng"]],
  ["VI", ["vietnamese", "tieng viet", "viet ngu", "tieng vn"]],
];

/** Words that carry no topic of their own inside a language directive ("in english bro please"). */
const DIRECTIVE_FILLER = new Set([
  "actually", "instead", "rather", "but", "and", "so", "then", "well", "not", "nhung", "roi", "con", "thay", "vao",
  "in", "to", "into", "only", "please", "pls", "plz", "now", "from", "on", "onwards", "always", "just", "again", "back", "the", "that", "this", "it", "me",
  "bro", "bruh", "man", "dude", "mate", "yo", "ok", "okay", "hey", "can", "could", "you", "u", "would", "will", "i", "want", "need", "prefer",
  "answer", "reply", "respond", "speak", "talk", "write", "say", "explain", "switch", "use", "go", "keep", "stay", "type", "chat", "translate",
  "noi", "tra", "loi", "bang", "sang", "dung", "chuyen", "viet", "di", "nhe", "nha", "giup", "lai", "tu", "gio", "tro", "thoi", "hoi", "cho", "tao", "toi", "minh", "may", "ban", "ong", "duoc", "khong", "a",
]);
/** A speaking verb right before the language name is a directive even inside a longer message. */
const DIRECTIVE_VERB = /(?:answer|reply|respond|speak|talk|write|explain|switch|say|use|noi|tra loi|viet|chuyen sang|dung)(?:\s+[a-z']+){0,4}?\s+(?:in\s+|to\s+|bang\s+|sang\s+)?$/;
/** Talking ABOUT a language is not a request to switch to it. */
const ABOUT_LANGUAGE = /(?:how (?:do|to|would) (?:you|i|we) say|what(?:'s| is| does)[^?]{0,40} (?:mean|called)|word for|my english|english (?:is|isn'?t|was) |learn(?:ing)? |teach |class|exam|nghia la gi|dich (?:la|sang) gi|hoc tieng)/;
const PERSISTENT = /\b(?:only|always|from now(?: on)?|going forward|every (?:time|reply)|tu gio|tu nay|luon|mai)\b/;

/**
 * scope TURN = the whole reply (and, through session state, the turns after it).
 * scope ITEM = the request names ONE thing to answer in that language inside a longer multi-request message
 *              ("…Bench nên tăng 2.5kg hay 5kg? Trả lời câu bench bằng tiếng Anh.") — the rest of the reply keeps the turn's
 *              language, which is the existing per-request behaviour of the obligation ledger.
 */
export type ExplicitLanguageRequest = { language: "EN" | "VI"; persistent: boolean; scope: "TURN" | "ITEM" };

const CLAUSE_BREAK = /[,.;!?\n]+|\s+[-–—]\s+/;
const topicWordsOf = (clause: string) => tokens(clause).filter((word) => !DIRECTIVE_FILLER.has(word));

/** "in english bro" · "english only from now" · "nói tiếng việt đi" · "can you explain that in English" → a request. */
export function detectExplicitLanguageRequest(message: string): ExplicitLanguageRequest | null {
  const whole = fold(message);
  if (!whole.trim() || ABOUT_LANGUAGE.test(whole)) return null;
  // Clause by clause, so a request tacked onto a question ("how much protein do I need, in english bro") still counts.
  // The last clause that asks wins ("not english, tiếng việt").
  const clauses = whole.split(CLAUSE_BREAK).filter((clause) => clause.trim());
  let found: { language: "EN" | "VI"; index: number; ownTopic: number } | null = null;
  clauses.forEach((clause, index) => {
    const hit = languageRequestedIn(clause);
    if (hit) found = { ...hit, index };
  });
  if (!found) return null;
  const request = found as { language: "EN" | "VI"; index: number; ownTopic: number };
  // It names its own target AND the message carries other requests → it governs that one item, not the turn.
  const otherRequests = clauses.filter((clause, index) => index !== request.index && topicWordsOf(clause).length >= 2).length;
  const scope = request.ownTopic >= 1 && otherRequests >= 1 ? "ITEM" : "TURN";
  return { language: request.language, persistent: PERSISTENT.test(whole), scope };
}

/** The request as it applies to the WHOLE reply — what the language decision, session state and conversation control read. */
export function detectTurnLanguageRequest(message: string): ExplicitLanguageRequest | null {
  const request = detectExplicitLanguageRequest(message);
  return request?.scope === "TURN" ? request : null;
}

/** One clause: a language name inside a directive-shaped clause, after a speaking verb, or as a trailing "in <language>". */
function languageRequestedIn(clause: string): { language: "EN" | "VI"; ownTopic: number } | null {
  const folded = clause.replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  let hit: { language: "EN" | "VI"; name: string; index: number } | null = null;
  for (const [language, names] of LANGUAGE_NAMES) {
    for (const name of names) {
      const index = folded.search(new RegExp(String.raw`(?<![a-z])${name}(?![a-z])`));
      if (index >= 0 && (!hit || index > hit.index)) hit = { language, name, index };
    }
  }
  if (!hit) return null;
  const head = folded.slice(0, hit.index);
  const tail = tokens(folded.slice(hit.index + hit.name.length));
  const rest = [...tokens(head), ...tail].filter((word) => !DIRECTIVE_FILLER.has(word));
  const trailing = /(?:^|\s)(?:in|bang|sang)\s+$/.test(head) && tail.every((word) => DIRECTIVE_FILLER.has(word));
  return rest.length <= 1 || DIRECTIVE_VERB.test(head) || trailing ? { language: hit.language, ownTopic: rest.length } : null;
}

/* ---------- address ---------- */

const ADDRESS_BAN = /(?:stop|don'?t|do not|quit|no more|dung|thoi|ngung|khong)\s+(?:call(?:ing)?|goi|xung|keu)\s+(?:me|tao|toi|minh|em|anh)?\s*(?:a |la |bang )?([a-z]{2,12})\b/;

export function detectAddressBans(message: string): string[] {
  const match = fold(message).match(ADDRESS_BAN);
  return match ? [match[1]] : [];
}

/* ---------- correction ---------- */

const CORRECTION_FRAMES: RegExp[] = [
  /\b(?:no|nope|nah|not that|wait|sorry|actually)\b[,.! ]*\s*i (?:meant|mean|was asking|asked)\b\s*(?:about\s+)?(.*)$/,
  /\bi (?:meant|was asking about|asked about)\b\s*(.*)$/,
  /\b(?:that'?s|that is|this is|thats) not what i (?:asked|meant|said)\b/,
  /\b(?:you|u) (?:answered|got|misread|misunderstood|missed)\b.{0,24}\b(?:wrong|question|point|it)\b/,
  /\bwrong (?:thing|question|answer|topic)\b/,
  /\b(?:not|didn'?t) (?:what i|answer(?:ing)? (?:my|the) question)\b/,
  /\by (?:tao|toi|minh|em) la\b\s*(.*)$/,
  /\bkhong phai\b.{0,40}\bma la\b\s*(.*)$/,
  /\b(?:tra loi|hieu) (?:sai|nham|lac de)\b/,
  /\b(?:hoi|noi) (?:cai khac|chuyen khac) (?:ma|co)\b/,
];

/** "no, I meant calories" · "that's not what I asked" · "you answered the wrong thing". USER CORRECTION > PRIOR INFERENCE. */
export function detectUserCorrection(message: string): { present: boolean; restatement: string | null } {
  const folded = fold(message);
  for (const frame of CORRECTION_FRAMES) {
    const match = folded.match(frame);
    if (!match) continue;
    const restatement = match[1]?.replace(/[.!?]+$/, "").trim();
    return { present: true, restatement: restatement ? restatement.slice(0, 120) : null };
  }
  return { present: false, restatement: null };
}

/* ---------- assistant feedback vs distress ---------- */

/** An evaluation of a reply or of the coach. A lexicon of judgement words, not of whole sentences. */
const EVALUATION = "vo duyen|vo dung|vo ly|nham|lam nham|lac de|sai roi|phien|kho hieu|dai dong|lan man|useless|dumb|stupid|annoying|wrong|bad|terrible|trash|garbage|worthless|rude|weird|cringe|unhelpful|off[- ]topic|pointless|confusing|nonsense|bs|bullshit|wack";
/** The evaluation has to be PREDICATED of the coach or its reply: "<coach> [is|so|quá …] <evaluation>" or "<evaluation> <bot|answer|…>". */
const COACH_THEN_EVALUATION = new RegExp(String.raw`(?<![a-z])(?:you|u|ur|your|you're|youre|may|ong|ban|dante|gemma)(?:\s+(?:are|r|is|so|really|just|such|a|an|being|sound|seem|answer|reply|response|noi|tra loi|that|qua|sao|ma|lai))*\s+(?:${EVALUATION})(?![a-z])`);
const REPLY_THEN_EVALUATION = new RegExp(String.raw`(?<![a-z])(?:that|this|that's|thats|it's|its)(?:\s+(?:is|was|answer|reply|so|really|just))*\s+(?:${EVALUATION})(?![a-z])`);
const EVALUATION_THEN_COACH = new RegExp(String.raw`(?<![a-z])(?:${EVALUATION})\s+(?:bot|ai|answer|reply|response|advice|dante|gemma)(?![a-z])`);
const FRUSTRATION_INTERJECTION = ["wtf", "wth", "bruh", "ffs", "omg", "smh", "ugh", "seriously", "come on", "cmon", "vcl", "vl", "dm", "dmm", "troi oi", "oi troi"];
const SILENCING = /(?<![a-z])(?:shut up|stfu|stop (?:talking|yapping|rambling|lecturing)|enough talk|im di|nin di|bot noi|noi it thoi|dung noi nua|just (?:give|tell|show) me|(?:chi can|dua|cho) (?:tao |toi |minh )?(?:con so|so lieu|ket qua))(?![a-z])/;
/** First-person state reports belong to the person, not to the reply: never read them as feedback about the coach. */
const FIRST_PERSON_STATE = /(?<![a-z])(?:i feel|i'?m feeling|i am feeling|i'?ve been feeling|i (?:want|wanna|need) to (?:die|hurt|kill)|hurt(?:ing)? myself|kill(?:ing)? myself|tao (?:thay|cam thay|muon chet)|toi (?:thay|cam thay|muon chet)|minh (?:thay|cam thay|muon chet))(?![a-z])/;
const COACH_PRONOUN = /(?<![a-z])(?:you|u|ur|your|may|ong|ban|dante|gemma|bot)(?![a-z])/;

/** "sao mày vô duyên thế" · "bro wtf" · "shut up and give me the numbers" → feedback about the COACH, not distress. */
export function classifyAssistantFeedback(message: string): AssistantFeedback {
  const folded = fold(message);
  if (FIRST_PERSON_STATE.test(folded)) return "NONE";
  if (SILENCING.test(folded)) return "STYLE_CONTROL";
  const words = tokens(folded);
  const question = /[?？]/.test(message);
  const criticised = COACH_THEN_EVALUATION.test(folded) || EVALUATION_THEN_COACH.test(folded) || (!question && REPLY_THEN_EVALUATION.test(folded))
    // An insult aimed at the coach ("mày ngu thế"); the phrase layer already keeps "buồn ngủ" out of this.
    || (COACH_PRONOUN.test(folded) && isInsult(message.toLowerCase().normalize("NFC")));
  if (criticised && words.length <= 16) return "CRITICISM";
  if (words.length <= 6 && FRUSTRATION_INTERJECTION.some((term) => hasTerm(folded, term))) return "FRUSTRATION";
  return "NONE";
}

/* ---------- tone ---------- */

const FORMAL_CUE = /\b(?:be (?:more )?(?:formal|professional)|formally|trang trong|lich su (?:hon|di))\b/;
const INFORMAL_MARK = ["bro", "bruh", "yo", "dude", "lol", "lmao", "may", "tao", "ong", "nha", "nhe"];

function detectTone(message: string): ControlTone {
  const folded = fold(message);
  if (FORMAL_CUE.test(folded)) return "FORMAL";
  return INFORMAL_MARK.some((term) => hasTerm(folded, term)) ? "INFORMAL" : "NEUTRAL";
}

const VERBOSITY: Record<string, ControlVerbosity> = { brief: "CONCISE", detailed: "DETAILED", default: "NORMAL" };

/** What is left of a message once its control phrases are removed decides whether it asks anything new. */
function carriesOwnQuestion(message: string, control: { language: boolean; ban: boolean; correction: { present: boolean; restatement: string | null }; feedback: AssistantFeedback }): boolean {
  if (control.correction.restatement) return true;
  const anyControl = control.language || control.ban || control.correction.present || control.feedback !== "NONE";
  if (!anyControl) return true;
  // Clause by clause: a clause that IS the control (feedback, a ban, a bare correction) carries no topic; in the rest,
  // language names and directive filler are not topic words. Two topic words left = the message also asks something.
  const languageWords = new Set(LANGUAGE_NAMES.flatMap(([, names]) => names.flatMap((name) => name.split(" "))));
  let topicWords = 0;
  for (const clause of fold(message).split(/[,.;!?\n]+|\s+[-–—]\s+/)) {
    if (!clause.trim()) continue;
    if (classifyAssistantFeedback(clause) !== "NONE" || ADDRESS_BAN.test(clause) || detectUserCorrection(clause).present) continue;
    topicWords += tokens(clause).filter((word) => !DIRECTIVE_FILLER.has(word) && !languageWords.has(word)).length;
  }
  return topicWords >= 2;
}

export type ConversationControlInput = {
  message: string;
  /** Prior USER messages, oldest → newest (bounded by the caller). Used only for persisted control state. */
  priorUserMessages?: string[];
  /** Hard safety or an active safety episode: feedback and correction readings are suppressed. */
  safetyActive?: boolean;
};

export function resolveConversationControl(input: ConversationControlInput): ConversationControl {
  const { message, priorUserMessages = [], safetyActive = false } = input;

  const current = detectTurnLanguageRequest(message);
  // Bounded control state: the most recent earlier explicit request stays in force until another replaces it.
  const persisted = current ? null : [...priorUserMessages].reverse().map(detectTurnLanguageRequest).find(Boolean) ?? null;

  const addressBans = [...new Set([...priorUserMessages.flatMap(detectAddressBans), ...detectAddressBans(message)])];
  const correction = safetyActive ? { present: false, restatement: null } : detectUserCorrection(message);
  const feedback: AssistantFeedback = safetyActive ? "NONE" : classifyAssistantFeedback(message);

  const stated = inferVerbosityPreference(message) ?? [...priorUserMessages].reverse().map((prior) => inferVerbosityPreference(prior)).find(Boolean) ?? null;
  const verbosity: ControlVerbosity = feedback === "STYLE_CONTROL" ? "CONCISE" : stated ? VERBOSITY[stated] : "NORMAL";

  return {
    responseLanguage: current?.language ?? persisted?.language ?? "MATCH_USER",
    languageSource: current ? "CURRENT_TURN" : persisted ? "PERSISTED" : "NONE",
    tone: detectTone(message),
    verbosity,
    addressBans,
    userCorrection: correction,
    assistantFeedback: feedback,
    controlOnly: !carriesOwnQuestion(message, { language: Boolean(current), ban: detectAddressBans(message).length > 0, correction, feedback }),
  };
}

/** The directive lines a coach prompt must obey. Empty when the turn carries no control at all. */
export function controlDirectives(control: ConversationControl, context: { previousUserQuestion?: string | null; previousReply?: string | null } = {}): string[] {
  const lines: string[] = [];
  if (control.responseLanguage !== "MATCH_USER") {
    lines.push(`LANGUAGE: write the whole reply in ${control.responseLanguage === "EN" ? "English" : "Vietnamese"} (${control.languageSource === "CURRENT_TURN" ? "the user asked for it in this message" : "the user asked for it earlier and has not changed it"}). Nothing below — persona, topic, earlier turns — may override this.`);
  }
  if (control.verbosity === "CONCISE") lines.push("LENGTH: the user asked for short answers. Lead with the answer or the numbers; no preamble, no recap.");
  if (control.verbosity === "DETAILED") lines.push("LENGTH: the user asked for more detail.");
  if (control.addressBans.length > 0) lines.push(`ADDRESS: never call the user ${control.addressBans.map((word) => `"${word}"`).join(" or ")}, or any similar nickname.`);
  if (control.tone === "FORMAL") lines.push("TONE: formal; no slang.");
  if (control.userCorrection.present) {
    lines.push(`CORRECTION: the user says the previous answer missed their question${control.userCorrection.restatement ? ` — they meant: "${control.userCorrection.restatement}"` : ""}. Acknowledge it in a few words, do not defend the earlier answer, and answer what they actually asked. Their correction outranks your earlier reading.`);
  }
  if (control.assistantFeedback === "CRITICISM" || control.assistantFeedback === "FRUSTRATION") {
    lines.push(`FEEDBACK: the user is reacting to YOUR previous reply. This is ordinary frustration with the assistant, not a report of how they feel: do not ask about their mood, wellbeing or whether something is wrong, do not lecture, and do not turn rude in return. Your reply has two parts and both are required: one short sentence owning the miss, then the actual answer${context.previousUserQuestion ? ` to what they asked — "${context.previousUserQuestion.slice(0, 240)}"` : " to their last real question"} — better than before. An apology with no answer is a failed reply.`);
  }
  if (control.assistantFeedback === "STYLE_CONTROL") {
    lines.push("FEEDBACK: the user wants less talk. Give the answer or the numbers directly; do not comment on their tone.");
  }
  if (control.controlOnly && (context.previousUserQuestion || context.previousReply)) {
    lines.push(`This message only changes HOW to answer. Apply it to the previous exchange${context.previousUserQuestion ? ` — the user had asked: "${context.previousUserQuestion.slice(0, 240)}"` : ""}${context.previousReply ? ` — your previous reply was: "${context.previousReply.slice(0, 600)}"` : ""}. Give that answer again under the new instruction instead of asking what they want.`);
  }
  return lines;
}
