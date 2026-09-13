/**
 * Narrow, deliberately conservative detector for messages that are
 * ACTION-shaped (need a tool call, possibly a write) rather than a
 * normal informational question. Kept separate from
 * app/api/chatbot/route.ts's own `detectIntent()` (training/nutrition/
 * supplement/health/recovery) — that classifier decides which
 * EVIDENCE sources to fetch for a prompt-stuffed answer; this one
 * decides whether to route the turn through the new tool-calling
 * orchestrator (lib/dante-core/tools/orchestrate.ts) at all. A false
 * negative here just means a normal Q&A answer is given instead of an
 * action being proposed — safe by construction, never the reverse.
 */
const ACTION_PATTERNS: RegExp[] = [
  /\badd\b.{0,60}\bto\s+(my\s+)?(breakfast|lunch|dinner|snack|log)\b/i,
  /\blog(ged)?\b.{0,10}(this|that|it|some)?\s*(food|meal)?\b.{0,40}\b\d+\s*(g|gram|grams)\b/i,
  /\b(start|schedule|begin)\b.{0,20}\b(today'?s?|my)?\s*workout\b/i,
  /\b(complete|finish|submit)\b.{0,20}\bcheck-?in\b/i,
  /\b(accept|apply)\b.{0,20}\b(recommendation|adjustment|suggestion)\b/i,
  /\bdelete\b.{0,20}\b(food|log entry|logged)\b/i,
  /\b(update|change|edit)\b.{0,20}\b(food log|quantity|logged)\b/i,
];

export function isAgentToolIntent(message: string): boolean {
  return ACTION_PATTERNS.some((pattern) => pattern.test(message));
}
