import type { KnowledgeCategory } from "@/lib/dante-core/knowledge-brain/types";

/**
 * Query routing for the Knowledge Brain (spec §6).
 *
 * Not every message should trigger a vector search. A question about
 * the user's OWN structured state ("how much protein do I have
 * left?", "what's my workout today?") is answered entirely from
 * AthleteState / Today's Plan / the Adaptive Program Engine — RAG
 * would add latency and an irrelevant "Sources" section for no
 * benefit. Knowledge Brain retrieval is reserved for questions whose
 * answer is genuinely reusable reference knowledge: exercise
 * technique/safety, or "what does the evidence say" style questions.
 *
 * This intentionally reuses the existing `Intent` shape detected in
 * app/api/chatbot/route.ts (training/nutrition/supplement/health/
 * recovery) rather than introducing a second, competing classifier —
 * it only adds the narrower "is this actually asking for reusable
 * knowledge, not my own numbers" distinction on top.
 */

export type ChatIntent = {
  training: boolean;
  nutrition: boolean;
  supplement: boolean;
  health: boolean;
  recovery: boolean;
};

export type KnowledgeBrainRoute = {
  use: boolean;
  categories: KnowledgeCategory[];
};

// "how much do I have left", "what's my workout today", "how many
// calories do I have" — a question about the CALLER's own current
// structured state, not general knowledge. These always win over any
// knowledge-intent pattern below.
const PERSONAL_DATA_PATTERNS: RegExp[] = [
  /\bhow (much|many)\b.{0,40}\b(do i|i've|i have)\b.{0,20}\b(left|remaining|today)\b/i,
  /\bwhat('?s| is)\b.{0,15}\bmy\b.{0,25}\b(workout|plan|session|macros?|calories?|targets?|schedule)\b/i,
  /\b(today'?s?)\b.{0,10}\b(workout|plan|session)\b/i,
  /\bhow (much|many)\b.{0,20}\b(protein|carbs?|fat|calories?|kcal)\b.{0,20}\b(left|remaining)\b/i,
];

const TECHNIQUE_PATTERNS: RegExp[] = [
  /\bhow (do|can|should) i (perform|do|execute)\b/i,
  /\b(proper|correct) (form|technique)\b/i,
  /\btechnique\b/i,
  /\bsafely\b/i,
  /\bform check\b/i,
  /\bhow to (perform|do)\b/i,
];

const EVIDENCE_PATTERNS: RegExp[] = [
  /\bwhat does (the )?(research|evidence|science|studies?) say\b/i,
  /\b(research|evidence|studies) (says?|shows?|suggests?)\b/i,
  /\bis there (any )?evidence\b/i,
  /\b(research|evidence) on\b/i,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyKnowledgeBrainRoute(
  message: string,
  intent: ChatIntent,
): KnowledgeBrainRoute {
  if (matchesAny(message, PERSONAL_DATA_PATTERNS)) {
    return { use: false, categories: [] };
  }

  const categories = new Set<KnowledgeCategory>();

  if (matchesAny(message, TECHNIQUE_PATTERNS)) {
    categories.add("exercise_technique");
    categories.add("safety");
  }

  const asksForEvidence = matchesAny(message, EVIDENCE_PATTERNS);

  if (asksForEvidence) {
    if (intent.supplement) categories.add("supplements");
    if (intent.nutrition) categories.add("nutrition");
    if (intent.recovery) categories.add("recovery");
    if (intent.training) categories.add("training");
    if (categories.size === 0) categories.add("general");
  }

  // A bare supplement question ("tell me about creatine") is
  // evidence-shaped even without an explicit "what does research say"
  // phrase — supplements are a domain users expect citations for.
  if (intent.supplement && !asksForEvidence && categories.size === 0) {
    categories.add("supplements");
  }

  return { use: categories.size > 0, categories: Array.from(categories) };
}
