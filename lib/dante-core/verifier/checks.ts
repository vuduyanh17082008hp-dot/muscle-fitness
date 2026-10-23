import type { MealIntakeFact, VerifierFact, VerifierFinding, VerifierInput } from "@/lib/dante-core/verifier/types";

export const EVIDENCE_LANGUAGE =
  /\b(?:research|studies|evidence|science)\s+(?:shows?|suggests?|indicates?|says?)\b|\baccording to (?:research|studies|a study)\b/i;

/**
 * Narrowly scoped to communication/scheduling verbs Dante has no
 * registered tool for at all (email, phone, text/SMS, an external
 * meeting) — never matches ordinary in-app language like "I've
 * updated your plan" or "I've scheduled your workout", which use
 * different verbs/objects entirely. Tolerates up to two filler words
 * between subject and verb ("I've already emailed...", "I'll just
 * call...").
 */
const FILLER = "(?:\\s+\\S+){0,2}";
const EXTERNAL_ACTION_CLAIM = new RegExp(
  `\\bi(?:'ve| have)?${FILLER}\\s+(?:sent|emailed|called|texted|messaged)\\b` +
    `|\\bi(?:'ll| will)${FILLER}\\s+(?:send|email|call|text|message)\\b` +
    `|\\bi(?:'ve| have)?${FILLER}\\s+(?:scheduled|booked)\\b[^.!?]{0,25}\\b(?:call|meeting|appointment|email)\\b`,
  "i",
);

/**
 * Specific-metric assertion patterns the reply is only allowed to make
 * when a matching known fact was actually supplied this turn. Each
 * pattern names the fact-label substrings ("hints") that would count
 * as traceable support for it — deliberately narrow (only patterns
 * that name a specific athlete metric by value) to avoid flagging
 * ordinary training advice ("aim for 8-12 reps") as invented data.
 */
const ATHLETE_METRIC_ASSERTIONS: Array<{ pattern: RegExp; factLabelHints: string[] }> = [
  { pattern: /\byour recovery(?:\s+score)?\s+(?:is|was)\s+\d+(?:\.\d+)?/i, factLabelHints: ["recovery"] },
  { pattern: /\byour readiness(?:\s+score)?\s+(?:is|was)\s+\d+(?:\.\d+)?/i, factLabelHints: ["readiness"] },
  { pattern: /\byou(?:'ve| have)?\s+slept\s+\d+(?:\.\d+)?\s*(?:hours?|h)\b/i, factLabelHints: ["sleep"] },
  { pattern: /\byour hrv\s+(?:is|was)\s+\d+(?:\.\d+)?/i, factLabelHints: ["hrv"] },
  {
    // Up to three filler words ("a total of", "about") and a thousands separator ("3,146").
    pattern: /\byou(?:'ve| have)?\s+(?:eaten|consumed|had)\s+(?:[a-z]+\s+){0,3}\d[\d,]*(?:\.\d+)?\s*(?:calories|kcal|g protein|grams? of protein)/i,
    factLabelHints: ["calorie", "protein"],
  },
  { pattern: /\byour (?:training )?load\s+(?:is|was)\s+\d+(?:\.\d+)?/i, factLabelHints: ["load"] },
];

/** Numbers as written, with "1,335" read as 1335 rather than 1 and 335. */
function numbersIn(text: string): number[] {
  return (text.match(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, "")));
}

function normalizeLabel(label: string): string {
  return label
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
}

/** Invariant 5 support: safety may halt processing at any stage — this is the last checkpoint before release, guarding against a future wiring bug bypassing the safety short-circuit upstream. */
export function checkSafetyAdherence(input: VerifierInput): VerifierFinding[] {
  if (!input.safety?.triggered || !input.safety.responseOverride) return [];

  if (input.replyText.trim() !== input.safety.responseOverride.trim()) {
    return [
      {
        code: "safety_override_violated",
        severity: "blocker",
        message: "Safety was triggered for this turn but the reply text does not match the required escalation response verbatim.",
      },
    ];
  }

  return [];
}

/** Invariant 9 support: a value that IS supplied must not be silently changed by the communication layer. */
/**
 * A cued fact (H0 final closure): a generic label like "protein" also names targets and g/kg guidelines, so only a mention
 * whose ±40-char window carries the cue ("logged", "so far"…) states the fact; it is wrong when none of that window's
 * numbers is the value. Every such mention is checked, not just the first.
 */
function cuedValueMismatch(reply: string, normalized: string, fact: VerifierFact): boolean {
  const lower = reply.toLowerCase();
  for (let index = lower.indexOf(normalized); index !== -1; index = lower.indexOf(normalized, index + 1)) {
    const start = Math.max(0, index - 40);
    // Kept to the label's own sentence: "…what you've eaten today. Your target is 3,220 calories" states no intake.
    const before = reply.slice(start, index).split(/[.!?](?=\s)|\n/).pop() ?? "";
    const after = reply.slice(index, index + normalized.length + 40).split(/[.!?](?=\s)|\n/)[0];
    const window = before + after;
    if (!fact.cue!.test(window)) continue;
    const numbers = numbersIn(window);
    if (numbers.length > 0 && !numbers.some((stated) => Math.abs(stated - fact.value) < 0.05 || Math.abs(stated - Math.round(fact.value)) < 0.05)) return true;
  }
  return false;
}

export function checkDeterministicValueMutation(input: VerifierInput): VerifierFinding[] {
  const findings: VerifierFinding[] = [];
  const lowerReply = input.replyText.toLowerCase();

  for (const fact of input.knownFacts) {
    const normalized = normalizeLabel(fact.label);
    if (fact.cue) {
      if (cuedValueMismatch(input.replyText, normalized, fact)) {
        findings.push({ code: "deterministic_value_mutation", severity: "blocker", message: `Reply states "${fact.label}" with a number other than the traceable ${fact.value}.` });
      }
      continue;
    }
    const labelIndex = lowerReply.indexOf(normalized);
    if (labelIndex === -1) continue;

    const window = input.replyText.slice(labelIndex, labelIndex + normalized.length + 40);
    const [stated] = numbersIn(window);
    if (stated === undefined) continue;

    const acceptable = [fact.value, Math.round(fact.value), Number(fact.value.toFixed(1))];
    // A fraction (e.g. 0.05) may legitimately be voiced as a percent (5).
    if (fact.value > -1 && fact.value < 1) acceptable.push(Math.round(fact.value * 100));

    const matches = acceptable.some((candidate) => Math.abs(candidate - stated) < 0.05);

    if (!matches) {
      findings.push({
        code: "deterministic_value_mutation",
        severity: "blocker",
        message: `Reply states "${fact.label}" as ${stated}, but the traceable value is ${fact.value}.`,
      });
    }
  }

  return findings;
}

/** Non-negotiable-rule support: the LLM may never invent an athlete metric that was never supplied. */
export function checkInventedAthleteMetric(input: VerifierInput): VerifierFinding[] {
  const findings: VerifierFinding[] = [];

  // Markdown emphasis ("**3,146 calories**") must not hide an assertion from the patterns.
  const plain = input.replyText.replace(/[*_]/g, "");
  for (const { pattern, factLabelHints } of ATHLETE_METRIC_ASSERTIONS) {
    const match = plain.match(pattern);
    if (!match) continue;

    const isTraceable = input.knownFacts.some((fact) => {
      const normalized = normalizeLabel(fact.label);
      return factLabelHints.some((hint) => normalized.includes(hint));
    });

    if (!isTraceable) {
      findings.push({
        code: "invented_athlete_metric",
        severity: "blocker",
        message: `Reply asserts a specific athlete metric ("${match[0]}") that was never supplied as a known fact this turn.`,
      });
    }
  }

  return findings;
}

/** The reply must never claim to have performed, or promise to perform, an action Dante has no registered tool for (email, phone call, text) — see lib/dante-core/tools/registry.ts, which has no such tool at all today. `executedActions` (real tool executions this turn, if any) is the only thing that can clear this: if some future tool's trace label loosely matches the claimed verb, it's a real completed action, not an invented one. */
export function checkToolCapabilityClaim(input: VerifierInput): VerifierFinding[] {
  const match = input.replyText.match(EXTERNAL_ACTION_CLAIM);
  if (!match) return [];

  const executedActions = input.executedActions ?? [];
  const claimedVerb = match[0].toLowerCase();
  const clearedByRealExecution = executedActions.some((action) => claimedVerb.includes(action.toLowerCase()) || action.toLowerCase().includes(claimedVerb));

  if (clearedByRealExecution) return [];

  return [
    {
      code: "claimed_tool_capability",
      severity: "blocker",
      message: `Reply claims an external action ("${match[0]}") that Dante has no registered tool for and did not execute this turn.`,
    },
  ];
}

/** Every claim invoking "research/evidence" must have had at least one source actually retrieved this turn. This does not verify the claim matches a specific source's content — only that some source was available (documented limitation, see docs/dante-core.md). */
export function checkCitationMismatch(input: VerifierInput): VerifierFinding[] {
  if (EVIDENCE_LANGUAGE.test(input.replyText) && input.availableSources.length === 0) {
    return [
      {
        code: "citation_mismatch",
        severity: "blocker",
        message: "Reply invokes research/evidence language, but no source was retrieved for this turn.",
      },
    ];
  }

  return [];
}

const MEAL_NAMES: Array<[MealIntakeFact["meal"], RegExp]> = [
  ["breakfast", /(?<!\p{L})(?:breakfast|bữa sáng)/iu],
  ["lunch", /(?<!\p{L})(?:lunch|bữa trưa)/iu],
  ["dinner", /(?<!\p{L})(?:dinner|supper|bữa tối)/iu],
  ["snack", /(?<!\p{L})(?:snacks?|bữa phụ|ăn vặt)(?!\p{L})/iu],
  ["pre_workout", /(?<!\p{L})(?:pre[- ]?workout|trước (?:buổi )?tập)/iu],
  ["post_workout", /(?<!\p{L})(?:post[- ]?workout|sau (?:buổi )?tập)/iu],
];
// About food at all, so "train two hours after breakfast" is not a meal claim.
const NUTRITION_WORDING = /kcal|calor|(?<!\p{L})cals?(?!\p{L})|protein|carb|(?<!\p{L})fats?(?!\p{L})|macro|\d\s*g(?!\p{L})|grams?|đạm|tinh bột|chất béo/iu;
// Advice, not the log: "aim for 600 kcal at dinner", "30–40 g carbs pre-workout". Deliberately strong words only — a
// claim with a stray "if" or "target" in it must still be checked.
const HYPOTHETICAL =
  /(?<!\p{L})(?:aim|try|should|could|consider|suggest\p{L}*|recommend\p{L}*|e\.g|for example|ideas?|options?|instead|swap|tonight|tomorrow|want me|would you like|shall i|(?:log|add) (?:it|this|that)|estimat\p{L}*|nên|có thể|thử|gợi ý|ví dụ|tối nay|ngày mai)(?!\p{L})|\d\s*(?:-|–|to)\s*\d/iu;
// Worded as what the log holds ("you had", "your lunch", "so far", "the breakdown") — not food knowledge that happens
// to name a meal ("for lunch, chicken rice is about 600 kcal").
// A meal said to contain, or be counted in, food — and that claim not denied ("nothing logged for breakfast").
const FOLDS_IN = /(?<!\p{L})(?:includ\p{L}*|part of|consist\p{L}*|counted|made up of|came from|had|ate|eaten)(?!\p{L})/iu;
const NEGATED = /(?<!\p{L})(?:no|not|nothing|none|never|without|yet to|chưa|không)(?!\p{L})|n['’]t\b/iu;
// Worded as the day's intake, with no meal named.
// A bare "Total: 690 kcal" also sums a suggested meal, so "total" counts only when tied to the day or the log.
const DAY_TOTAL = String.raw`totals?[^.\n]{0,25}(?:today|for the day|so far|logged|consumed)`;
const DAY_INTAKE = new RegExp(String.raw`(?<!\p{L})(?:intake|consumed|eaten|ate|logged|so far|you'?ve had|you have had|${DAY_TOTAL}|đã ăn|đã nạp|đã log)(?!\p{L})`, "iu");
const LOG_CUE = new RegExp(String.raw`(?<!\p{L})(?:had|ate|eaten|logged|consumed|recorded|your|so far|was|were|${DAY_TOTAL}|breakdown|đã ăn|đã log|đã nạp|của bạn)(?!\p{L})`, "iu");
// After "Here's a dinner suggestion:", lines are advice until one is worded as the log again.
const STRONG_LOG = /(?<!\p{L})(?:consumed|logged|eaten|so far|breakdown|intake|you'?ve had|you had|you ate|đã ăn|đã log)(?!\p{L})/iu;

/** A figure attached to the meal itself: "Breakfast: 920 kcal", "breakfast 920", "lunch (579 kcal)", "a 900 kcal breakfast". */
function attachesFigure(sentence: string, name: RegExp): boolean {
  const match = name.exec(sentence);
  if (!match) return false;
  const after = sentence.slice(match.index + match[0].length);
  const before = sentence.slice(0, match.index);
  return /^\s*[:=—–(-]?\s*[~≈]?\s*\d/u.test(after) || /\d\s*(?:kcal|calories?|cals?|g)(?:\s+(?:of\s+)?protein)?\s+(?:(?:at|for|from|in|during)\s+(?:your\s+)?)?$/iu.test(before);
}
// Clock times, dates and percentages are not intake amounts.
const NOT_AN_AMOUNT = /\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm)(?!\p{L})|\d+(?:\.\d+)?\s*%/giu;
const LIST_ITEM = /^\s*(?:[-*•+]|\d+[.)])\s+/;

const supports = (values: number[], stated: number) =>
  values.some((value) => [value, Math.round(value), Math.round(value * 10) / 10].some((candidate) => Math.abs(candidate - stated) < 0.05));

/**
 * A correct daily total does not authorize per-meal numbers, and a day-level intake figure must be the log's own. A sentence that names a meal, states an amount and is
 * worded as the log (LOG_CUE, or the figure attached to the meal) is a claim about that meal today, so each of its
 * numbers must be one the log holds for the meals named, or a day-level figure. A meal with no rows supports only 0; an
 * unreadable log supports nothing. List items are read with the line that introduces them ("Breakfast:", "Here's your
 * breakdown:"), so a per-item kcal under a meal is checked too.
 */
export function checkMealLevelClaims(input: VerifierInput): VerifierFinding[] {
  const intake = input.mealIntake;
  if (!intake) return [];

  const findings: VerifierFinding[] = [];
  let header = "";
  let advice = false;
  for (const rawLine of input.replyText.replace(/[*_#>`]/g, "").split("\n")) {
    const isItem = LIST_ITEM.test(rawLine);
    const line = rawLine.replace(LIST_ITEM, "").trim();
    const mealsIn = (text: string) => MEAL_NAMES.filter(([, name]) => name.test(text)).map(([meal]) => meal);
    const underAdvice = advice && !STRONG_LOG.test(line);
    if (!isItem && HYPOTHETICAL.test(line)) advice = true;
    else if (STRONG_LOG.test(line)) advice = false;
    if (underAdvice) continue;

    // Only a list item or a meal-led line ("Breakfast: 920 kcal") belongs to the line above it.
    const lead = isItem || MEAL_NAMES.some(([, name]) => name.exec(line)?.index === 0) ? header : "";

    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      const named = mealsIn(sentence);
      const meals = named.length > 0 ? named : mealsIn(lead);
      const context = `${lead} ${sentence}`;
      if (!NUTRITION_WORDING.test(context) || HYPOTHETICAL.test(context)) continue;

      if (meals.length === 0) {
        // A day-level intake figure ("your total calorie intake so far is 393 kcal") must be one the log holds too.
        if (!DAY_INTAKE.test(context)) continue;
        const allowed = [...intake.dayValues.filter(Number.isFinite), ...(intake.meals ?? []).flatMap((logged) => [0, ...logged.values])];
        const unsupported = numbersIn(sentence.replace(NOT_AN_AMOUNT, " ")).filter((stated) => !supports(allowed, stated));
        if (unsupported.length > 0) {
          findings.push({
            code: "unsupported_intake_claim",
            severity: "blocker",
            message: intake.meals
              ? `Reply states ${unsupported.join(", ")} as today's intake, which today's food log does not support. Use todayFoodLog's consumed/target/remaining figures exactly.`
              : `Reply states ${unsupported.join(", ")} as today's intake, but the food log could not be read. State no intake figure; say it is unavailable.`,
          });
        }
        continue;
      }
      // No number needed to invent a meal: "breakfast is part of your snack", "includes the foods you had at breakfast".
      const unlogged = intake.meals ? named.filter((meal) => !intake.meals!.some((logged) => logged.meal === meal)) : [];
      const stated = numbersIn(sentence);
      // "You had 0 kcal at breakfast" is true.
      if (unlogged.length > 0 && FOLDS_IN.test(sentence) && !NEGATED.test(sentence) && !(stated.length > 0 && stated.every((n) => n === 0))) {
        findings.push({
          code: "unsupported_intake_claim",
          severity: "blocker",
          message: `Reply says food was eaten at ${unlogged.join("/")}, but nothing is logged under ${unlogged.join("/")} today. Say plainly that it has nothing logged; never fold one meal into another.`,
        });
        continue;
      }
      const underMealHeading = isItem && named.length === 0 && lead.endsWith(":");
      const claim = LOG_CUE.test(context) || underMealHeading || MEAL_NAMES.some(([meal, name]) => named.includes(meal) && attachesFigure(sentence, name));
      if (!claim) continue;

      const allowed = [
        ...intake.dayValues.filter(Number.isFinite),
        ...(intake.meals ? [0] : []),
        ...meals.flatMap((meal) => intake.meals?.find((logged) => logged.meal === meal)?.values ?? []),
      ];
      const unsupported = numbersIn(sentence.replace(NOT_AN_AMOUNT, " ")).filter((stated) => !supports(allowed, stated));
      if (unsupported.length === 0) continue;

      const logged = meals.map((meal) => {
        if (!intake.meals) return `${meal}: food log unavailable`;
        const row = intake.meals.find((candidate) => candidate.meal === meal);
        return row ? `${meal}: ${row.values[0]} kcal logged` : `${meal}: nothing logged`;
      });
      findings.push({
        code: "unsupported_intake_claim",
        severity: "blocker",
        message: `Reply states ${unsupported.join(", ")} for ${meals.join("/")}, which today's food log does not support (${logged.join("; ")}). State per-meal figures only from todayFoodLog.meals and never split the daily total across meals; otherwise give the day's total.`,
      });
    }

    // A list is read with the line that introduced it; a meal-led line ("Breakfast: 920 kcal") keeps the one above it.
    if (line && !isItem && (line.endsWith(":") || mealsIn(line).length === 0)) header = line;
  }

  return findings;
}
