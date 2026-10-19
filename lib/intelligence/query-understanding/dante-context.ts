import { scalePer100g, toGrams, type ResolvedFood, type ResolveRequest } from "../food-resolution";
import { reconcileRecoveryReport, type CurrentRecovery } from "@/lib/recovery/current-recovery";
import { buildQueryDiagnostics } from "./diagnostics";
import { STATE_GLOSS, type PhraseState } from "./phrases";
import { parseUserQuery } from "./frame";
import { decideRetrieval } from "./retrieval";
import { recordQueryDiagnostics } from "./telemetry";
import type { FrameContext, HistoryTurn, RetrievalDecision, UserQueryFrame } from "./types";

/**
 * Dante's bridge to the shared query layer. Produces (a) the internal frame + retrieval decision and (b) ONE compact
 * prompt block with deterministic facts: resolved references, cross-domain relevance, and verified food facts READ through
 * the shared resolver. Dante gets nutrition FACTS for performance questions; meal construction stays Gemma's, and this block
 * says so. No handoff is performed (R1E.3 is out of scope). Never throws.
 */

export interface DanteQueryContext {
  frame: UserQueryFrame;
  retrieval: RetrievalDecision;
  /** Null when the frame adds nothing beyond the raw message (casual/bare/unknown turns). */
  block: string | null;
}

/**
 * CURRENT verified recovery state for this user, projected from the same loader the Recovery page uses
 * (`loadRecoveryContext`). It is the highest-authority source for "today": it outranks what the user typed,
 * stale memory, 7-day averages and the personal baseline.
 */
export interface DanteCurrentRecovery {
  hasCheckin: boolean;
  /** Today's canonical 0-100 score, null when no check-in exists today. */
  score: number | null;
  status: string | null;
  lowestDrivers?: string[];
  painIllness?: unknown;
  trainingLoadState?: string | null;
  missingInputs?: string[];
  /** CURRENT / STALE / MISSING for the user's local day. When STALE its score is an OLDER day's, never today's. */
  state?: CurrentRecovery | null;
}

export type DanteFoodResolver = (req: ResolveRequest) => Promise<ResolvedFood>;

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : String(Math.round(n * 10) / 10));

function foodFacts(label: string, r: ResolvedFood, grams: number | null): string | null {
  if (r.status === "AMBIGUOUS") return `food_fact: ${label} — raw vs cooked changes the numbers materially and the user did not say which; do not state macros, ask one short question if it matters.`;
  const p = r.per100g;
  if (r.status === "UNRESOLVED" || !p) return `food_fact: ${label} — no verified nutrition data available; do not invent numbers.`;
  const src = r.source === "USDA_FDC" ? "USDA FoodData Central" : "app curated table";
  const est = r.status === "ESTIMATED" ? " (ESTIMATED — basis differs from what was asked)" : "";
  let line = `food_fact (${src}${est}): ${r.name}, ${r.basis} basis, per 100 g = ${fmt(p.calories)} kcal, ${fmt(p.protein)} g protein, ${fmt(p.carbs)} g carbs, ${fmt(p.fat)} g fat.`;
  if (grams) {
    const s = scalePer100g(p, grams);
    line += ` For ${grams} g (deterministic arithmetic, do not recompute) = ${fmt(s.calories)} kcal, ${fmt(s.protein)} g protein, ${fmt(s.carbs)} g carbs, ${fmt(s.fat)} g fat.`;
  }
  return line;
}

export async function buildDanteQueryContext(
  message: string,
  history: HistoryTurn[],
  options: { athleteState?: FrameContext["athleteState"]; resolveFood?: DanteFoodResolver; isLocallyKnown?: (base: string) => boolean; currentRecovery?: DanteCurrentRecovery | null } = {},
): Promise<DanteQueryContext> {
  const frame = parseUserQuery(message, { surface: "DANTE", history, athleteState: options.athleteState });
  const retrieval = decideRetrieval(frame, { isLocallyKnown: options.isLocallyKnown });
  const lines: string[] = [];
  let usda: string | undefined;
  let local: boolean | undefined;
  let latencyMs: number | undefined;

  const food = frame.entities.find((e) => e.kind === "FOOD");
  const wantsFacts = Boolean(food) && frame.intent !== "MEAL_IDEA" && frame.intent !== "MEAL_ADJUSTMENT" && frame.intent !== "CRAVING"
    && (retrieval.sources.includes("USDA") || retrieval.sources.includes("LOCAL"));
  if (wantsFacts && food) {
    try {
      const resolve = options.resolveFood ?? (await import("../food-resolution/server")).resolveFood;
      const q = frame.entities.find((e) => e.kind === "QUANTITY") ?? frame.entities.find((e) => e.kind === "QUANTITY");
      const g = q?.amount !== undefined && q.unit ? toGrams(q.amount, q.unit).grams : null;
      const r = await resolve({ text: food.value, base: food.base, preparation: frame.constraints.preparation, quantityGrams: g });
      const line = foodFacts(food.value, r, g);
      if (line) lines.push(line);
      usda = r.diagnostics.USDA_LOOKUP.status;
      local = r.diagnostics.LOCAL_LOOKUP.hit;
      latencyMs = r.diagnostics.USDA_LOOKUP.latencyMs;
    } catch {
      lines.push(`food_fact: ${food.value} — lookup failed; do not invent numbers.`);
    }
  }

  recordQueryDiagnostics("DANTE", buildQueryDiagnostics(frame, retrieval), { usda, local, latencyMs });

  const readinessLines = frame.intent === "READINESS_RECOMMENDATION" ? readinessDecisionLines(frame, options.currentRecovery ?? null) : [];
  const stateLines = userStateLines(frame);

  const informative = readinessLines.length > 0 || stateLines.length > 0 || lines.length > 0 || Boolean(frame.followUpOf) || frame.references.resolvedFromHistory || frame.crossCoachRelevance !== "IRRELEVANT" || frame.ambiguity.present
    || frame.deferToGemma || retrieval.thinking === "DEEP";
  const neutral = frame.intent === "CASUAL" || frame.intent === "SOCIAL_INSULT" || frame.intent === "BARE_MENTION" || frame.intent === "SAFETY_SYMPTOM";
  if (!informative || neutral) return { frame, retrieval, block: null };

  const head = [
    `domain=${frame.primaryDomain}${frame.secondaryDomains.length ? ` (+${frame.secondaryDomains.join(",")})` : ""}`,
    `intent=${frame.intent}`,
    `need=${frame.informationNeed}`,
    `reasoning_effort=${retrieval.thinking}`,
    `sources=${retrieval.sources.join("+") || "none"}`,
  ].join("; ");
  const body: string[] = [head];
  if (frame.followUpOf) body.push(`follow_up_of: "${frame.followUpOf.replace(/"/g, "'")}" — this message continues that topic. Answer it directly about that topic; never ask what it refers to.`);
  if (frame.references.resolvedFromHistory) body.push(`resolved_from_conversation: ${frame.references.previousEntityRefs.join(", ")} (use these; do not ask the user to repeat them).`);
  const c = frame.constraints;
  if (c.intakeCalories !== undefined) body.push(`user_stated_intake: ${c.intakeCalories} kcal (self-reported, not verified logged data; prefer today's logged food if present and mention the difference).`);
  if (frame.crossCoachRelevance !== "IRRELEVANT") body.push(`cross_domain: NUTRITION relevance=${frame.crossCoachRelevance}. Answer from the performance/readiness angle and name how intake changes the risk or the expected quality of the session.`);
  if (frame.ambiguity.present) body.push(`unresolved: ${frame.ambiguity.fields.join(", ")} — ask only if the answer changes; otherwise state the assumption.`);
  body.push(...stateLines, ...readinessLines, ...lines);
  if (frame.deferToGemma || frame.crossCoachRelevance === "MATERIAL" || frame.crossCoachRelevance === "CRITICAL") {
    body.push("boundary: do NOT write a meal plan or prescribe a nutrition plan. If a material nutrition adjustment is needed, say the nutrition coach (Gemma) is the right place to build it. Nutrition facts above are for reasoning about training only.");
  }
  if (retrieval.thinking === "DEEP") body.push("depth: consider competing explanations and say what evidence is missing; do not present one cause as certain.");
  return { frame, retrieval, block: body.join("\n") };
}

/** What the user's own words mean, so a phrase is never re-read word by word ("buồn ngủ" = sleepy, not sad or bored). */
function userStateLines(frame: UserQueryFrame): string[] {
  const states = [...new Set(frame.entities.filter((e) => e.kind === "STATE").map((e) => e.value as PhraseState))];
  if (states.length === 0) return [];
  return [`user_states (their own words, already interpreted — do not re-interpret): ${states.map((s) => `${s}=${STATE_GLOSS[s]}`).join("; ")}.`];
}

/** The structured state when the caller has it; otherwise derived from "checked in today or not". */
function recoveryState(current: DanteCurrentRecovery | null): CurrentRecovery | null {
  if (!current) return null;
  if (current.state) return current.state;
  return current.hasCheckin
    ? { status: "CURRENT", score: current.score, recordedDate: null, localDate: "", provenance: "VERIFIED_CHECKIN" }
    : { status: "MISSING", score: null, recordedDate: null, localDate: "", provenance: "NONE" };
}

/**
 * A train/rest decision question. The verified current state is stated as fact, the objective-vs-subjective conflict is
 * named, and the answer shape is fixed: decide first, bounded and actionable. A baseline comparison is NOT a prerequisite
 * for this question — only "is this lower than MY normal?" needs one.
 */
export function readinessDecisionLines(frame: UserQueryFrame, current: DanteCurrentRecovery | null): string[] {
  const r = frame.readiness;
  if (!r) return [];
  const lines: string[] = [];
  lines.push("readiness_decision: the client asks whether to train or rest TODAY. Your FIRST sentence is the recommendation (see recommended_decision below), then the why. Never open with data caveats, and never answer this with 'not enough baseline' — personal baseline is irrelevant to a today-decision.");

  // PF-04: one reconciliation of verified vs user-stated vs stale. The user's number never overwrites a verified one.
  const state = recoveryState(current);
  const reconciled = reconcileRecoveryReport(state, r.statedRecoveryScore);
  const verified = reconciled.verified;
  const stale = state?.status === "STALE" && state.score !== null
    ? ` The last check-in on record is from ${state.recordedDate} (score ${state.score}/100) — status=STALE: it is NOT today's recovery; if you mention it, give its date and never call it today's or current.`
    : "";

  if (verified !== null) {
    const extra = [current?.status ? `status=${current.status}` : null, current?.trainingLoadState ? `training_load=${current.trainingLoadState}` : null, current?.lowestDrivers?.length ? `lowest_drivers=${current.lowestDrivers.join(", ")}` : null].filter(Boolean).join("; ");
    lines.push(`current_recovery (VERIFIED check-in today, authoritative over memory, history and the user's own number): score=${verified}/100${extra ? `; ${extra}` : ""}. Say this number explicitly.`);
    if (reconciled.conflict) lines.push(`recovery_conflict=true: verified=${verified} (VERIFIED), user_reported=${r.statedRecoveryScore} (USER_EXPLICIT). user_quoted_recovery=${r.statedRecoveryScore} differs from the verified ${verified}: use ${verified} and say so plainly; do not adopt the user's number.`);
  } else if (current) {
    lines.push(`current_recovery: no check-in logged today${r.statedRecoveryScore !== null ? `; the user quotes ${r.statedRecoveryScore} (self-reported, unverified; provenance=USER_EXPLICIT)` : ""}. Say that, treat the quoted number as self-reported, and suggest logging today's check-in.${stale}`);
  } else if (r.statedRecoveryScore !== null) {
    lines.push(`current_recovery: not loaded; the user quotes ${r.statedRecoveryScore} (self-reported, unverified).`);
  }
  if (current?.painIllness === "yes") lines.push("pain_illness: the check-in reports pain or illness — treat that as a real red flag and be conservative.");

  const objectiveLow = verified !== null ? verified < 50 : r.objective === "LOW";
  const subjective = r.subjective;
  if (subjective) lines.push(`subjective_readiness=${subjective} (user-explicit, not measured).`);
  if ((objectiveLow && subjective === "HIGH") || (!objectiveLow && (verified !== null || r.objective === "OK") && subjective === "LOW")) {
    lines.push(`evidence_state=PARTIALLY_IDENTIFIED: ${objectiveLow ? "OBJECTIVE_RECOVERY_LOW + SUBJECTIVE_READINESS_HIGH" : "OBJECTIVE_RECOVERY_OK + SUBJECTIVE_READINESS_LOW"}. Keep BOTH in view: the score does not erase how they feel, and feeling good does not erase the score. Reason toward the lower-risk action.`);
  }
  const redFlag = current?.painIllness === "yes";
  const known = verified !== null || r.objective !== null;
  const decision = redFlag ? "REST_OR_CONSERVATIVE"
    : !known ? "ASK_FOR_CHECKIN_THEN_BOUNDED_PLAN"
      : objectiveLow ? (subjective === "HIGH" ? "REDUCED_SESSION_WITH_READINESS_TEST" : "LEAN_REST_OR_VERY_LIGHT_TECHNIQUE_ONLY")
        : "TRAIN_WITH_NORMAL_AUTOREGULATION";
  lines.push(`recommended_decision=${decision} (deterministic from the facts above; your first sentence states it in your own words. Do not tell them to stay home/rest instead unless the decision says so; the user's own wording "or rest" is not a reason to pick rest).`);
  if (decision === "REDUCED_SESSION_WITH_READINESS_TEST") {
    lines.push("shape: yes, they can go — but as a reduced session, not a normal one. Longer warm-up as the readiness test; no PR or max attempts; cut volume and intensity; stop and go home/rest if warm-ups feel abnormally heavy, bar speed drops sharply, or dizziness/pain appears. Do not default to full rest from one score when they feel strong and report no red flag.");
  }
  lines.push("policy: the recovery score is a coaching signal, not a medical measurement — never say a low score means 'unsafe', 'injured', or that the body 'needs' recovery time, and never wave it away. Describe it as a signal to be more conservative. Any red flag (chest pain, dizziness, pain, illness) overrides everything: stop training and be conservative.");
  return lines;
}
