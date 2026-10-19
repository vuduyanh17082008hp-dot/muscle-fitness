/**
 * AI-R1E.2: Gemma (Nutrition Coach) READ-ONLY consumer of persisted Dante CoachSignals.
 * Loads same-user ACTIVE, unexpired, schema-compatible, NUTRITION-targeted, privacy-permitted signals (loadActiveCoachSignalsForDomain),
 * projects them for Gemma, and returns compact context: refs + closed-vocabulary directives. Never mutates a signal (no consume/expire),
 * never writes nutrition state, never throws. A signal is CONTEXT: deterministic nutrition truth and the verified Athlete State outrank it.
 * Target ownership != source ownership: a GLOBAL-sourced signal that targets NUTRITION is consumable.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logToolEvent } from "@/lib/dante-core/tools/observability";
import { loadActiveCoachSignalsForDomain } from "./coach-signal-store";
import type { CoachSignal, PrivacyClass } from "./coordination";
import { applySupersession, evaluateCoordinationGate, evaluateCrossDomainRelevance, isSignalActive, privacyRank, projectSignalForTarget } from "./coordination";
import { toUserScopeRef } from "./dante-runtime";
import { buildExecutiveWorkspace } from "./executive";

/** Gemma may read NORMAL + SENSITIVE (the user's own recovery context). MEDICAL never reaches the nutrition coach. */
export const GEMMA_CLEARANCE: PrivacyClass = "SENSITIVE";
/** Below this many remaining kcal a recovery directive cannot be honoured without going over: the user decides, not the coach. */
export const LOW_BUDGET_KCAL = 300;
const LOAD_TIMEOUT_MS = 2000;

export type GemmaDirective =
  | "AVOID_AGGRESSIVE_DEFICIT" | "SUPPORT_RECOVERY_NUTRITION" | "REVIEW_PRE_TRAINING_FUEL"
  // H0 cluster D: what the user disclosed to Dante, so it survives the handoff. Closed vocabulary; the user's words never cross.
  | "NO_DRUG_OPTIMISED_DIET" | "INSULIN_HYPO_RISK" | "PREGNANCY_AWARE_NUTRITION" | "NO_DEFICIT_LOW_INTAKE" | "KIDNEY_CONDITION_PROTEIN_BY_DOCTOR" | "DIABETES_GLUCOSE_AWARE"
  | "AVOID_ALLERGEN_FISH" | "AVOID_ALLERGEN_SHELLFISH" | "AVOID_ALLERGEN_NUTS" | "AVOID_ALLERGEN_DAIRY" | "AVOID_ALLERGEN_EGGS" | "AVOID_ALLERGEN_SOY" | "AVOID_ALLERGEN_GLUTEN" | "AVOID_ALLERGEN_SESAME";

/** The recovery directives — the only ones the remaining-budget wording of coordinationNote is about. */
const RECOVERY_DIRECTIVES: ReadonlySet<GemmaDirective> = new Set(["AVOID_AGGRESSIVE_DEFICIT", "SUPPORT_RECOVERY_NUTRITION", "REVIEW_PRE_TRAINING_FUEL"]);

const allergen = (food: string, terms: string) => ({
  prompt: `The user told Dante they are allergic to ${food}. Never suggest a food, meal or supplement containing ${terms}.`,
  note: `You told Dante about a ${food} allergy, so I've kept ${food} out.`,
});

/** Allergen directive → the term Gemma's meal engine excludes (ctx.guards.allergies). */
export const ALLERGEN_GUARD: Partial<Record<GemmaDirective, string>> = {
  AVOID_ALLERGEN_FISH: "fish", AVOID_ALLERGEN_SHELLFISH: "shellfish", AVOID_ALLERGEN_NUTS: "nuts", AVOID_ALLERGEN_DAIRY: "dairy",
  AVOID_ALLERGEN_EGGS: "egg", AVOID_ALLERGEN_SOY: "soy", AVOID_ALLERGEN_GLUTEN: "gluten", AVOID_ALLERGEN_SESAME: "sesame",
};

/** Closed vocabulary: unknown implication values are ignored (forward-compatible), never interpreted as free text. */
const DIRECTIVES: Record<GemmaDirective, { prompt: string; note: string }> = {
  AVOID_AGGRESSIVE_DEFICIT: {
    prompt: "Recovery looked low today (from Dante). Do not push an aggressive calorie deficit; keep protein adequate and meals easy to eat.",
    note: "Your recovery looks low today, so I'm not pushing a tighter calorie cut — this stays inside your normal remaining budget.",
  },
  SUPPORT_RECOVERY_NUTRITION: {
    prompt: "Recent training load is high (from Dante). Favour recovery nutrition: protein plus carbohydrate, steady meals.",
    note: "Your recent training load is high, so I'm leaning toward recovery nutrition (protein with carbs) within your remaining budget.",
  },
  REVIEW_PRE_TRAINING_FUEL: {
    prompt: "A heavy session is scheduled (from Dante). Consider pre-training fuel timing and easy-to-digest carbohydrate.",
    note: "You have a heavy session coming up, so it's worth fuelling with easy-to-digest carbs beforehand — I'll keep it inside your remaining budget.",
  },
  NO_DRUG_OPTIMISED_DIET: {
    prompt: "The user told Dante they are currently using anabolic steroids or other PEDs. Give no diet, macro, timing or supplement advice built around the drug or meant to get more out of it; normal healthy eating for their goal is fine.",
    note: "I'll keep this to normal healthy eating for your goal — nothing built around a cycle.",
  },
  INSULIN_HYPO_RISK: {
    prompt: "The user told Dante they use insulin to build muscle. Give no carbohydrate timing or meal plan built around insulin; if they mention feeling shaky, sweaty, confused or faint, tell them to take fast sugar now and get help.",
    note: "I won't time carbs around insulin — that's how dangerous low blood sugar happens.",
  },
  PREGNANCY_AWARE_NUTRITION: {
    prompt: "The user told Dante they are pregnant (or trying to conceive / breastfeeding). Keep advice pregnancy-safe (no raw or undercooked fish, meat or eggs, no high-mercury fish, no alcohol), do not set a calorie deficit, and leave supplements and caffeine amounts to their midwife or doctor.",
    note: "You mentioned a pregnancy to Dante, so I've kept this pregnancy-safe.",
  },
  NO_DEFICIT_LOW_INTAKE: {
    prompt: "The user told Dante they eat dangerously little. Do not suggest a deficit, smaller portions or a cutting plan; gently support eating enough and suggest a doctor or dietitian.",
    note: "You told Dante you've been eating very little, so I'm not cutting anything here.",
  },
  KIDNEY_CONDITION_PROTEIN_BY_DOCTOR: {
    prompt: "The user told Dante they have kidney disease. Do not raise protein above their plan or suggest protein powders or supplements; their protein target belongs to their doctor or renal dietitian.",
    note: "With the kidney condition you mentioned to Dante, I'm keeping protein as planned — your doctor sets that target.",
  },
  DIABETES_GLUCOSE_AWARE: {
    prompt: "The user told Dante they have diabetes. Keep carbohydrate advice general and glucose-aware; insulin or medication timing is for their diabetes team.",
    note: "With the diabetes you mentioned to Dante, keep an eye on your glucose with this — dose decisions stay with your diabetes team.",
  },
  AVOID_ALLERGEN_FISH: allergen("fish", "fish or fish oil"),
  AVOID_ALLERGEN_SHELLFISH: allergen("shellfish", "shellfish or crustaceans"),
  AVOID_ALLERGEN_NUTS: allergen("nuts", "peanuts, tree nuts or nut butters"),
  AVOID_ALLERGEN_DAIRY: allergen("dairy", "milk, whey, casein or other dairy"),
  AVOID_ALLERGEN_EGGS: allergen("eggs", "eggs or egg protein"),
  AVOID_ALLERGEN_SOY: allergen("soy", "soy or soy protein"),
  AVOID_ALLERGEN_GLUTEN: allergen("gluten", "wheat or gluten"),
  AVOID_ALLERGEN_SESAME: allergen("sesame", "sesame"),
};
const isDirective = (v: string): v is GemmaDirective => Object.hasOwn(DIRECTIVES, v);

export type GemmaCoordination = {
  signalLoaded: boolean;
  signalTypes: string[];
  /** Workspace refs only (signal ids), never the full payload. */
  signalRefs: string[];
  directives: GemmaDirective[];
  reasoningLevel: string;
  reasonCodes: string[];
  /** Structured, privacy-safe lines for model prompts. */
  promptContext: Array<{ kind: "DANTE_CONTEXT"; value: string }>;
};

export const EMPTY_COORDINATION: GemmaCoordination = { signalLoaded: false, signalTypes: [], signalRefs: [], directives: [], reasoningLevel: "NONE", reasonCodes: [], promptContext: [] };

/** Pure: raw loaded signals → Gemma's view. Re-checks every invariant so a caller passing unfiltered signals is still safe. */
export function interpretSignalsForGemma(signals: CoachSignal[], userId: string, now: Date, clearance: PrivacyClass = GEMMA_CLEARANCE): GemmaCoordination {
  try {
    const scope = toUserScopeRef(userId);
    // Same-user, active (lifecycle + window), not superseded, privacy-permitted. CONSUMED is not "normal read" state.
    const live = applySupersession(signals).filter((s) => s.userScope === scope && isSignalActive(s, now) && !s.supersededBy && privacyRank(s.privacyClass) <= privacyRank(clearance));
    if (evaluateCoordinationGate(live, scope, now) === "BLOCK_NORMAL_COORDINATION") return EMPTY_COORDINATION;
    const projected = live.map((s) => projectSignalForTarget(s, "GEMMA")).filter((s) => s.implications.some((i) => i.targetDomain === "NUTRITION"));
    const accepted = projected.filter((s) => s.sourceCoach !== "GEMMA" && evaluateCrossDomainRelevance(s, "GEMMA", now) !== "IRRELEVANT");
    const directives = [...new Set(accepted.flatMap((s) => s.implications.map((i) => i.value)).filter(isDirective))];
    if (accepted.length === 0 || directives.length === 0) return EMPTY_COORDINATION;
    const ws = buildExecutiveWorkspace(
      { runId: `run:gemma:${now.getTime().toString(36)}`, userScope: scope, currentGoal: "RECOMMEND_NUTRITION", activeDomain: "nutrition", complexity: "EXPLANATION", declaredRisk: "LOW", signals: accepted, viewer: "GEMMA" },
      now,
    );
    return {
      signalLoaded: true,
      signalTypes: [...new Set(accepted.map((s) => s.signalType))],
      signalRefs: ws.signalRefs,
      directives,
      reasoningLevel: ws.reasoningBudget.level,
      reasonCodes: ws.reasoningBudget.reasonCodes,
      promptContext: directives.map((d) => ({ kind: "DANTE_CONTEXT" as const, value: DIRECTIVES[d].prompt })),
    };
  } catch {
    return EMPTY_COORDINATION;
  }
}

/** Never throws, never retries. Any failure/timeout → exactly the pre-R1E.2 behaviour (EMPTY_COORDINATION). `client` is the user-session client. */
export async function loadGemmaCoordination(client: SupabaseClient, userId: string, now: Date, clearance: PrivacyClass = GEMMA_CLEARANCE): Promise<GemmaCoordination> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const signals = await Promise.race([
      loadActiveCoachSignalsForDomain(client, { userId, targetDomain: "NUTRITION", clearance, now }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), LOAD_TIMEOUT_MS);
      }),
    ]);
    if (!signals) {
      logToolEvent("GEMMA_COORDINATION", { stage: "signal load failed", errorCategory: "timeout" });
      return EMPTY_COORDINATION;
    }
    const result = interpretSignalsForGemma(signals, userId, now, clearance);
    logToolEvent("GEMMA_COORDINATION", {
      stage: "signal load",
      fields: { signalLoaded: result.signalLoaded, signalCount: result.signalTypes.length, directiveCount: result.directives.length, reasoningLevel: result.reasoningLevel },
    });
    return result;
  } catch {
    logToolEvent("GEMMA_COORDINATION", { stage: "signal load failed", errorCategory: "exception" });
    return EMPTY_COORDINATION;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Deterministic one/two-sentence note for a meal recommendation. Authority: the canonical remaining budget outranks the signal, so when
 * the budget cannot absorb the directive the note says so and leaves the decision to the user. Only numbers from the canonical snapshot.
 */
export function coordinationNote(c: GemmaCoordination, caloriesRemaining: number): string | null {
  if (!c.signalLoaded || c.directives.length === 0) return null;
  // A disclosure note never depends on the budget; only the recovery directives talk about remaining calories.
  if (!c.directives.some((d) => RECOVERY_DIRECTIVES.has(d))) return c.directives.map((d) => DIRECTIVES[d].note).slice(0, 2).join(" ");
  const rounded = Math.round(caloriesRemaining);
  if (rounded <= 0) return "Dante flagged recovery context today, but you have no calories left in today's target. I haven't changed your target — if you want extra recovery fuel, that's your decision.";
  if (rounded < LOW_BUDGET_KCAL) return `Dante flagged recovery context today, but only about ${rounded} kcal remain. I'll keep recovery support inside that; going over your target would be your decision, not something I'll do silently.`;
  return c.directives.map((d) => DIRECTIVES[d].note).slice(0, 2).join(" ");
}

/**
 * True when the user is asking what to eat (a meal suggestion), so the coordination note belongs on whatever mode answers it.
 * Narrow on purpose: "is rice good?" or a log/edit message never matches. ponytail: regex, EN only; widen with the semantic interpreter.
 */
export const asksForMealSuggestion = (message: string): boolean =>
  /\b(?:what|which)\b.{0,30}\b(?:eat|have|cook|make)\b|\b(?:idea|suggest\w*|recommend\w*|option)s?\b.{0,40}\b(?:dinner|lunch|breakfast|snack|meal|eat|food)\b|\b(?:dinner|lunch|breakfast|snack|meal|food)s?\b.{0,40}\b(?:idea|suggest\w*|recommend\w*|option)s?\b|\b(?:something|anything)\b.{0,24}\b(?:light|easy|quick|to eat|for (?:dinner|lunch|breakfast|tonight))\b|\bwhat'?s for (?:dinner|lunch)\b|\bhigh[- ]protein (?:dinner|lunch|meal|snack)\b/i.test(message);

/** Privacy-safe diagnostics echoed on the response (tokens/enums/counts only). */
export const coordinationDiagnostics = (c: GemmaCoordination, noteApplied: boolean) => ({
  signalLoaded: c.signalLoaded,
  signalTypes: c.signalTypes,
  signalRefs: c.signalRefs,
  directives: c.directives,
  reasoningLevel: c.reasoningLevel,
  noteApplied,
});
