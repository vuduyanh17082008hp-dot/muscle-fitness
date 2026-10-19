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
/** "Plan a heavy leg day", "schedule a push session": a request for a workout's content, not a write. */
const WORKOUT_PLAN = /\b(schedule|book|plan)\b.{0,30}\b(?:leg|push|pull|chest|back|upper|lower|arm|arms|full[- ]body|shoulder|glute)s?\s+(?:day|session|workout)\b/i;

const ACTION_PATTERNS: RegExp[] = [
  // One qualifier may sit before the meal: "add a banana to my afternoon snack" (H1-LOG-01 fell through to plain Q&A).
  /\badd\b.{0,60}\bto\s+(my\s+)?(?:(?:afternoon|morning|evening|late|night|post-?workout|pre-?workout|today'?s|food)\s+)?(breakfast|lunch|dinner|snacks?|log|diary)\b/i,
  /\blog(ged)?\b.{0,10}(this|that|it|some)?\s*(food|meal)?\b.{0,40}\b\d+\s*(g|gram|grams)\b/i,
  /\b(start|schedule|begin)\b.{0,20}\b(today'?s?|my)?\s*workout\b/i,
  /\b(complete|finish|submit)\b.{0,20}\bcheck-?in\b/i,
  /\b(accept|apply)\b.{0,20}\b(recommendation|adjustment|suggestion)\b/i,
  /\bdelete\b.{0,20}\b(food|log entry|logged)\b/i,
  /\b(update|change|edit)\b.{0,20}\b(food log|quantity|logged)\b/i,
  // H0 cluster C: "log 3 boiled eggs", "log 2 slices of toast" — a log verb with a count is a write ask even without grams.
  /^\s*(?:please\s+|can you\s+|could you\s+)?log\b\s+(?:my\s+)?(?:\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|half|some)\b/i,
  WORKOUT_PLAN,
  // Vietnamese: "thêm 2 quả trứng vào bữa sáng", "ghi 200g ức gà vào bữa trưa".
  /(?:^|\s)(?:thêm|ghi|log)\s.{0,40}\bvào\s+(?:bữa\s+)?(?:sáng|trưa|tối|phụ|nhật ký|log)/iu,
];

export const isWorkoutPlanAsk = (message: string): boolean => WORKOUT_PLAN.test(message);

export function isAgentToolIntent(message: string): boolean {
  return ACTION_PATTERNS.some((pattern) => pattern.test(message));
}
