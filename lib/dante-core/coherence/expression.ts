/**
 * Phase 2.5a — expression model (pure; no I/O, no state writes).
 *
 *   DANTE CORE IDENTITY (immutable) → USER EXPRESSION PROFILE → CURRENT CONTEXT OVERRIDE → EXPRESSION PLAN
 *
 * Only four adaptive dimensions exist: addressStyle, familiarity, humor, verbosity. Expression may change HOW Dante
 * says something. It never touches truth, provenance, uncertainty, laterality, corrections, obligations, privacy,
 * safety or non-sycophancy — those are decided upstream and this module cannot see them.
 *
 * AddressStyle is NOT Familiarity: familiarity never selects a pronoun and an address style never implies a
 * familiarity level. Each has its own explicit render map below.
 */

import type {
  AddressForm,
  AddressStyle,
  ContextMode,
  ExpressionDimension,
  ExpressionPlan,
  ExpressionValueMap,
  Familiarity,
  Humor,
  SafetyPhase,
  UserExpressionProfile,
} from "@/lib/dante-core/coherence/types";

/** Dante's baseline. An unknown preference means THIS, never a generic corporate-neutral voice (P-8). */
export const DANTE_BASELINE: Readonly<ExpressionValueMap> = Object.freeze({
  addressStyle: "NEUTRAL",
  familiarity: "CASUAL",
  humor: "LIGHT",
  verbosity: "DEFAULT",
});

export const ADDRESS_STYLES: readonly AddressStyle[] = ["NEUTRAL", "MAY_TAO", "BAN_TOI", "ONG_TOI", "ANH_EM"];

/** Ordinal dimensions, lowest → highest. addressStyle is nominal and has no order. */
export const ORDINAL_ORDER = {
  familiarity: ["NEUTRAL", "CASUAL", "FAMILIAR"],
  humor: ["OFF", "LIGHT"],
  verbosity: ["BRIEF", "DEFAULT", "DETAILED"],
} as const satisfies Partial<Record<ExpressionDimension, readonly string[]>>;

export const PROMOTION_THRESHOLD = 3;
/** Window = this many consecutive USER turns (the current one included). */
export const PROMOTION_WINDOW_TURNS = 10;
export const IDLE_RESET_MS = 30 * 60 * 1000;

export function isValidExpressionValue(dimension: ExpressionDimension, value: string): boolean {
  if (dimension === "addressStyle") return (ADDRESS_STYLES as readonly string[]).includes(value);
  return (ORDINAL_ORDER[dimension] as readonly string[]).includes(value);
}

/**
 * P-7 BOUNDED INFERENCE: an inferred/repeated adaptation moves an ordinal dimension by at most ONE enum level per
 * user turn. Explicit requests never go through this. addressStyle is nominal — it is replaced, not stepped.
 */
export function clampInferredStep(dimension: ExpressionDimension, current: string, target: string): string {
  if (dimension === "addressStyle") return target;
  const order = ORDINAL_ORDER[dimension] as readonly string[];
  const from = order.indexOf(current);
  const to = order.indexOf(target);
  if (from < 0 || to < 0) return current;
  return order[from + Math.max(-1, Math.min(1, to - from))] as string;
}

/* ------------------------------------------------------------------ */
/* Legacy AddressForm <-> AddressStyle                                 */
/* ------------------------------------------------------------------ */

export function toAddressForm(style: AddressStyle | null | undefined): AddressForm {
  switch (style) {
    case "MAY_TAO":
      return "tao_may";
    case "BAN_TOI":
      return "ban";
    case "ONG_TOI":
      return "ong";
    case "ANH_EM":
      return "anh_em";
    case "NEUTRAL":
      return "neutral";
    default:
      return "unresolved";
  }
}

/** "bro" has no AddressStyle (custom vocatives are deferred); neutral/unresolved carry no preference. */
export function fromAddressForm(form: AddressForm): AddressStyle | null {
  switch (form) {
    case "tao_may":
      return "MAY_TAO";
    case "ban":
      return "BAN_TOI";
    case "ong":
      return "ONG_TOI";
    case "anh_em":
      return "ANH_EM";
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Context override (Phase 2.5a: SAFETY_SERIOUS | SAFETY_INFO | NORMAL)  */
/* ------------------------------------------------------------------ */

const ACTIVE_SAFETY: ReadonlySet<SafetyPhase> = new Set<SafetyPhase>(["ENTER", "PERSIST", "ESCALATE"]);

/**
 * The existing Task-4 safety lifecycle is the only source of truth — no separate detector here.
 *   SAFETY_SERIOUS  the lifecycle says an episode is active (ENTER/PERSIST/ESCALATE)
 *   SAFETY_INFO     safety is in the conversation but not active (DOWNGRADE, or a historical/informational mention)
 *   NORMAL          everything else
 */
export function resolveContextMode(input: { safetyPhase: SafetyPhase; safetyMentioned: boolean }): ContextMode {
  if (ACTIVE_SAFETY.has(input.safetyPhase)) return "SAFETY_SERIOUS";
  if (input.safetyPhase === "DOWNGRADE" || input.safetyMentioned) return "SAFETY_INFO";
  return "NORMAL";
}

/* ------------------------------------------------------------------ */
/* Address render map — controlled ONLY by AddressStyle                */
/* ------------------------------------------------------------------ */

export const ADDRESS_RENDER_MAP: Readonly<Record<AddressStyle, { user: string | null; self: string | null }>> = Object.freeze({
  NEUTRAL: { user: null, self: null },
  MAY_TAO: { user: "mày", self: "tao" },
  BAN_TOI: { user: "bạn", self: "tôi" },
  ONG_TOI: { user: "ông", self: "tôi" },
  // anh/em follows the user's own direction: the user is "anh", Dante answers as "em".
  ANH_EM: { user: "anh", self: "em" },
});

/** English has no managed address style (no custom vocative enum in 2.5a) — every English vocative is out of plan. */
export function allowedVocativesFor(style: AddressStyle): readonly string[] {
  const user = ADDRESS_RENDER_MAP[style].user;
  return user ? [user] : [];
}

/* ------------------------------------------------------------------ */
/* Familiarity render map — rhythm and informality, NEVER pronouns     */
/* ------------------------------------------------------------------ */

export type FamiliarityRender = {
  /** English: expand ("do not"), leave as authored, or contract ("don't"). */
  contractions: "expand" | "keep" | "contract";
  /** Vietnamese sentence-final softeners (nhé/nha/nhá): drop for the restrained register, else leave. */
  viSofteners: "drop" | "keep";
};

export const FAMILIARITY_RENDER_MAP: Readonly<Record<Familiarity, FamiliarityRender>> = Object.freeze({
  NEUTRAL: { contractions: "expand", viSofteners: "drop" },
  CASUAL: { contractions: "keep", viSofteners: "keep" },
  FAMILIAR: { contractions: "contract", viSofteners: "keep" },
});

const CONTRACTION_PAIRS: ReadonlyArray<readonly [contracted: string, full: string]> = [
  ["don't", "do not"],
  ["doesn't", "does not"],
  ["can't", "cannot"],
  ["won't", "will not"],
  ["isn't", "is not"],
  ["aren't", "are not"],
  ["it's", "it is"],
  ["that's", "that is"],
];

function matchCase(source: string, replacement: string): string {
  return source[0] === source[0]?.toUpperCase() && source[0] !== source[0]?.toLowerCase()
    ? replacement[0]?.toUpperCase() + replacement.slice(1)
    : replacement;
}

/** Surface rhythm only; the wording of every fact is untouched (a contraction is the same words). */
export function applyFamiliarity(text: string, familiarity: Familiarity, language: "en" | "vi"): string {
  const render = FAMILIARITY_RENDER_MAP[familiarity];
  if (language === "vi") {
    return render.viSofteners === "drop" ? text.replace(/[ \t]+(?:nhé|nha|nhá)(?=\s*[.!?,;\n]|$)/giu, "") : text;
  }
  if (render.contractions === "keep") return text;
  let out = text;
  for (const [contracted, full] of CONTRACTION_PAIRS) {
    const [from, to] = render.contractions === "expand" ? [contracted, full] : [full, contracted];
    out = out.replace(new RegExp(`(?<![\\p{L}'’])${from.replace("'", "['’]")}(?![\\p{L}])`, "giu"), (m) => matchCase(m, to));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* ExpressionPlan                                                       */
/* ------------------------------------------------------------------ */

export type TurnOverride = Partial<{ [D in ExpressionDimension]: ExpressionValueMap[D] }>;

function activeValue<D extends ExpressionDimension>(
  profile: UserExpressionProfile,
  dimension: D,
): ExpressionValueMap[D] | undefined {
  const pref = profile[dimension] as { value: ExpressionValueMap[D]; status: string } | undefined;
  return pref && pref.status === "ACTIVE" ? pref.value : undefined;
}

function minLevel<T extends string>(order: readonly T[], a: T, b: T): T {
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
}

function maxLevel<T extends string>(order: readonly T[], a: T, b: T): T {
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/**
 * Authority: truth/safety requirements > current TURN override > profile (explicit durable/session, then repeated,
 * then inferred — the reducer keeps exactly one ACTIVE record per dimension, already resolved by that ladder) >
 * Dante baseline. The safety override is temporary and is applied to the PLAN only — never written to the profile.
 */
export function resolveExpressionPlan(input: {
  profile: UserExpressionProfile;
  turnOverride?: TurnOverride;
  contextMode: ContextMode;
}): ExpressionPlan {
  const { profile, turnOverride = {}, contextMode } = input;
  const pick = <D extends ExpressionDimension>(d: D): ExpressionValueMap[D] =>
    turnOverride[d] ?? activeValue(profile, d) ?? (DANTE_BASELINE[d] as ExpressionValueMap[D]);

  const addressStyle = pick("addressStyle");
  let familiarity = pick("familiarity");
  let humor: Humor = pick("humor");
  let verbosity = pick("verbosity");

  if (contextMode === "SAFETY_SERIOUS") {
    humor = "OFF";
    familiarity = minLevel(ORDINAL_ORDER.familiarity, familiarity, "CASUAL");
    verbosity = maxLevel(ORDINAL_ORDER.verbosity, verbosity, "DEFAULT");
  }

  return {
    addressStyle,
    familiarity,
    humor,
    verbosity,
    contextMode,
    allowedAddressBehavior: { style: addressStyle, allowedVocatives: allowedVocativesFor(addressStyle) },
    allowHumorMarkers: humor === "LIGHT" && contextMode === "NORMAL",
  };
}

export function baselinePlan(contextMode: ContextMode = "NORMAL"): ExpressionPlan {
  return resolveExpressionPlan({ profile: {}, contextMode });
}

/** The plan restricted to the deterministic neutral renderer: NEUTRAL address, NEUTRAL familiarity, humor OFF. */
export function neutralPlan(contextMode: ContextMode): ExpressionPlan {
  return {
    addressStyle: "NEUTRAL",
    familiarity: "NEUTRAL",
    humor: "OFF",
    verbosity: "DEFAULT",
    contextMode,
    allowedAddressBehavior: { style: "NEUTRAL", allowedVocatives: [] },
    allowHumorMarkers: false,
  };
}

/**
 * Style instructions for the PROVIDER prompt — the model is asked, the Persona Gate guarantees. Address and
 * familiarity are separate lines on purpose. Carries no facts.
 */
export function buildStyleHint(plan: ExpressionPlan, language: "en" | "vi"): string {
  const lines: string[] = [];
  const address = ADDRESS_RENDER_MAP[plan.addressStyle];
  if (language === "vi" && address.user && address.self) {
    lines.push(`Address: use ${address.user}/${address.self} consistently; never switch to another address form.`);
  } else {
    lines.push("Address: no second-person vocative at all (never bro, dude, mate, buddy, man, ông, bạn, cậu, mày, or a name).");
  }
  lines.push(
    plan.familiarity === "NEUTRAL"
      ? "Register: restrained and plain."
      : plan.familiarity === "FAMILIAR"
        ? "Register: warm and colloquial, like a training partner — still no vocative unless Address allows one."
        : "Register: natural and conversational.",
  );
  lines.push(
    plan.humor === "OFF"
      ? "Humor: none. No jokes, teasing, emoji or laughter."
      : plan.allowHumorMarkers
        ? "Humor: at most one light, dry remark; never at the user's expense."
        : "Humor: none in this context.",
  );
  lines.push(
    plan.verbosity === "BRIEF"
      ? "Length: lead with the decision, at most two short paragraphs, no preamble."
      : plan.verbosity === "DETAILED"
        ? "Length: explain the reasoning in full."
        : "Length: as long as the answer needs and no longer.",
  );
  lines.push(
    "Decision: on a resolved yes/no coaching call, state the call first, then one safety/condition boundary if needed, then stop. Do not recast a resolved call as consider/might/if you feel confident/ultimately it's up to you. Hedge only when information is genuinely missing. No unsolicited alternatives.",
  );
  return `\n\nSESSION STYLE\n${lines.join("\n")}\nThe session style changes wording only — never facts, certainty, safety guidance, corrections or refusals.`;
}
