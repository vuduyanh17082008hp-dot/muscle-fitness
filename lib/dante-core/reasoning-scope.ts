/**
 * P-15R — reasoning scope belongs to the obligation, not the turn.
 * Turn-level parse may find candidate constraints; they attach to the
 * matching obligation. Shared retrieval is allowed. Shared eligibility
 * is not, when sibling scopes differ.
 */

export type ReasoningFactor =
  | "rain"
  | "weather"
  | "sleep"
  | "recovery"
  | "nutrition"
  | "protein"
  | "calories"
  | "training_history"
  | "training_load"
  | "goal";

export type ReasoningScope = {
  mode: "NONE" | "ONLY" | "EXCLUDE";
  allowedFactors: ReasoningFactor[];
  excludedFactors: ReasoningFactor[];
  safetyOverride: true;
};

export const NONE_SCOPE: ReasoningScope = {
  mode: "NONE",
  allowedFactors: [],
  excludedFactors: [],
  safetyOverride: true,
};

type ScopedObligation = {
  id: string;
  intent?: string;
  payload?: { normalized?: string };
  sourceSpan?: { start: number; end: number; text: string };
  segmentIndices?: number[];
  reasoningScope?: ReasoningScope;
  priority?: number;
};

const FACTOR_PATTERNS: Array<{ factor: ReasoningFactor; pattern: RegExp }> = [
  { factor: "rain", pattern: /\brain(?:ing)?\b|mưa|mua\b/i },
  { factor: "weather", pattern: /weather|lightning|flood|visibility|trời|troi|giông|giong|sét|set/i },
  { factor: "sleep", pattern: /sleep|slept|ngủ|ngu\b/i },
  { factor: "protein", pattern: /protein/i },
  { factor: "calories", pattern: /calories?|kcal|calorie/i },
  { factor: "nutrition", pattern: /nutrition|macros?|dinner|ăn |an uong/i },
  { factor: "recovery", pattern: /recovery|check-?in|hồi phục|hoi phuc/i },
  { factor: "training_history", pattern: /training history|lịch sử tập|lich su tap/i },
  { factor: "training_load", pattern: /training load|khối lượng tập|khoi luong tap/i },
  { factor: "goal", pattern: /\bgoal\b|lean bulk|mục tiêu|muc tieu/i },
];

type ContextKey =
  | "recovery"
  | "currentNutritionPlan"
  | "todayFoodLog"
  | "trainingIntelligence"
  | "adaptiveTraining"
  | "dailyPlan"
  | "digitalTwin"
  | "fitnessProfile"
  | "preferences";

const FACTOR_KEYS: Record<ReasoningFactor, ContextKey[]> = {
  rain: [],
  weather: [],
  sleep: ["preferences"],
  recovery: ["recovery", "digitalTwin", "dailyPlan"],
  nutrition: ["currentNutritionPlan", "todayFoodLog", "preferences"],
  protein: ["currentNutritionPlan", "todayFoodLog"],
  calories: ["currentNutritionPlan", "todayFoodLog"],
  training_history: ["trainingIntelligence", "adaptiveTraining"],
  training_load: ["trainingIntelligence", "adaptiveTraining", "dailyPlan"],
  goal: ["fitnessProfile"],
};

const LEAK: Record<string, RegExp> = {
  recovery: /recovery score|check-in|hồi phục|hoi phuc|training consistency/i,
  nutrition: /lean bulk|calorie target|kcal|macro|protein target|carbs? target/i,
  training_load: /training load|effective sets|volume this week/i,
  training_history: /training history|logged sets last/i,
  goal: /lean bulk|hypertrophy goal/i,
  alternatives: /home workout|tập ở nhà|tap o nha|alternative cardio|reschedule/i,
};

const WEATHER_SAFETY = /lightning|flood|flooding|visibility|giông|sét|ngập|ngap/i;

const FORGET_EVERYTHING =
  /(?:forget|ignore|skip)\s+(?:all\s+)?(?:everything else|all other(?:\s+factors)?)|despite all other(?:\s+factors)?|ngoài\s+.+?\s+ra\s+(?:đừng|dung|không|khong)\s+xét|ngoai\s+.+?\s+ra\s+(?:dung|khong)\s+xet/i;

const ONLY_WINDOW =
  /(?:only considering|only based on|just considering|just based on|just because of|just consider|chỉ xét|chi xet|chỉ dựa vào|chi dua vao|chỉ tính|chi tinh|chỉ dựa trên|chi dua tren)\s*([^,.?]*)|(?:\brain(?:ing)? only\b|\brain alone\b|mưa thôi|mua thoi)/gi;

/** Semantic ONLY paraphrases — not a brittle exact-string list. */
const ONLY_PARAPHRASE: RegExp[] = [
  /consider nothing (?:except|but)\s+([^,.?]+)/gi,
  /nothing matters(?: here)? except\s+([^,.?]+)/gi,
  /(?:only take|take only)\s+([^,.?]+?)\s+into account/gi,
  /base this only on\s+([^,.?]+)/gi,
  /judge this only by\s+([^,.?]+)/gi,
  /chỉ tính(?: chuyện)?\s+([^,.?]+)/gi,
  /chỉ lấy\s+([^,.?]+?)\s+làm yếu tố/gi,
  /chỉ dựa trên\s+([^,.?]+)/gi,
  /không xét gì ngoài\s+([^,.?]+)/gi,
  /khong xet gi ngoai\s+([^,.?]+)/gi,
  /ngoài\s+([^,.?]+?)\s+ra(?:\s+không xét gì khác)?/gi,
];

const BASIS_WINDOW =
  /\b(?:based on|considering|because of|dựa vào|dua vao|xét|xet)\s+([^,.?]+)/gi;

const EXCLUDE_WINDOW =
  /(?:ignore|exclude|don'?t use|do not use|don'?t factor in|do not factor in|don'?t consider|do not consider|forget|without considering|apart from|except|bỏ qua|bo qua|đừng xét|dung xet|không tính|khong tinh|không dựa vào|khong dua vao|đừng dùng|dung dung)\s+(?:my\s+|the\s+)?([^.?,]+?)(?=\s+out\b|\s+ra\b|[.,]|$| and | và )|leave\s+(?:my\s+)?([^.?,]+?)\s+out|(?:loại|loai|bỏ|bo)\s+([^.?,]+?)\s+ra/gi;

const REQUEST_SPLIT =
  /\?\s+|\s*,\s*(?:and|và|va)\s+|\s+(?:and|và|va)\s+(?=based on|considering|what\b|should\b|c[oó] nên)/gi;

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function factorsIn(text: string): ReasoningFactor[] {
  return FACTOR_PATTERNS.filter((row) => row.pattern.test(text)).map((row) => row.factor);
}

function expand(factors: ReasoningFactor[]): ReasoningFactor[] {
  const out = [...factors];
  if (out.includes("rain") && !out.includes("weather")) out.push("weather");
  if ((out.includes("protein") || out.includes("calories")) && !out.includes("nutrition")) out.push("nutrition");
  return unique(out);
}

function windows(text: string, re: RegExp): string[] {
  const out: string[] = [];
  const copy = new RegExp(re.source, re.flags);
  for (const hit of text.matchAll(copy)) {
    out.push((hit[1] || hit[2] || hit[3] || hit[0] || "").trim());
  }
  return out;
}

function isRequestClause(text: string): boolean {
  return /should i|what should|am i |c[oó] nên|co nen|\?|log\b|skip the gym|nghỉ gym|nghi gym/i.test(text);
}

export function splitRequestClauses(text: string): { text: string; start: number; end: number }[] {
  const parts: { text: string; start: number; end: number }[] = [];
  const copy = new RegExp(REQUEST_SPLIT.source, REQUEST_SPLIT.flags);
  let cursor = 0;
  for (const hit of text.matchAll(copy)) {
    const at = hit.index ?? 0;
    if (at > cursor) parts.push({ text: text.slice(cursor, at).trim(), start: cursor, end: at });
    cursor = at + hit[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor).trim(), start: cursor, end: text.length });
  const kept = parts.filter((p) => p.text.length > 0);
  return kept.length > 0 ? kept : [{ text, start: 0, end: text.length }];
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
}

function extractOne(text: string): ReasoningScope {
  const raw = text.trim();
  if (!raw) return NONE_SCOPE;

  const forgetEverything = FORGET_EVERYTHING.test(raw);

  let allowed = unique(windows(raw, ONLY_WINDOW).flatMap(factorsIn));
  if (allowed.length === 0) {
    allowed = unique(ONLY_PARAPHRASE.flatMap((re) => windows(raw, re)).flatMap(factorsIn));
  }

  const excluded = unique(
    sentences(raw)
      .flatMap((sentence) => windows(sentence, EXCLUDE_WINDOW))
      .filter((chunk) => !/everything else|all other/i.test(chunk))
      .flatMap(factorsIn)
      .filter((factor) => !allowed.includes(factor)),
  );

  if (allowed.length === 0) {
    allowed = unique(windows(raw, BASIS_WINDOW).flatMap(factorsIn));
  }
  if (allowed.length === 0 && forgetEverything) {
    allowed = factorsIn(raw).filter((f) => !excluded.includes(f));
  }
  if (allowed.length === 0 && /rain alone|rain only|raining only|mưa thôi|mua thoi/i.test(raw)) {
    allowed = ["rain"];
  }
  if (allowed.length === 0 && excluded.length > 0) {
    allowed = factorsIn(raw).filter((f) => !excluded.includes(f));
  }
  allowed = allowed.filter((f) => !excluded.includes(f));
  const excludedOnly = unique(excluded.filter((f) => !allowed.includes(f)));

  if (allowed.length > 0) {
    return {
      mode: "ONLY",
      allowedFactors: expand(allowed),
      excludedFactors: excludedOnly,
      safetyOverride: true,
    };
  }
  if (excludedOnly.length > 0) {
    return { mode: "EXCLUDE", allowedFactors: [], excludedFactors: excludedOnly, safetyOverride: true };
  }
  return NONE_SCOPE;
}

/**
 * Clause-local extract. Two sibling requests in one string do not union
 * into a shared contract — that is turn-global authority and is forbidden.
 */
export function extractReasoningScope(message: string): ReasoningScope {
  const text = message.trim();
  if (!text) return NONE_SCOPE;
  const clauses = splitRequestClauses(text);
  const requests = clauses.filter((c) => isRequestClause(c.text));
  if (requests.length > 1) {
    const scopes = requests.map((c) => extractOne(c.text));
    if (scopes.every((s) => sameScope(s, scopes[0]))) return scopes[0];
    return NONE_SCOPE;
  }
  return extractOne(text);
}

export function sameScope(a: ReasoningScope, b: ReasoningScope): boolean {
  const key = (s: ReasoningScope) =>
    `${s.mode}|${[...s.allowedFactors].sort().join(",")}|${[...s.excludedFactors].sort().join(",")}`;
  return key(a) === key(b);
}

export function scopeOf(obligation: { reasoningScope?: ReasoningScope } | null | undefined): ReasoningScope {
  return obligation?.reasoningScope ?? NONE_SCOPE;
}

export function primaryObligationScope(obligations: readonly ScopedObligation[]): ReasoningScope {
  const opens = obligations.filter((o) => o.intent === "OPEN_REQUEST");
  const pool = opens.length > 0 ? opens : obligations;
  if (pool.length === 0) return NONE_SCOPE;
  const scopes = pool.map(scopeOf);
  if (scopes.every((s) => sameScope(s, scopes[0]))) return scopes[0];
  return NONE_SCOPE;
}

export function hasDivergentReasoningScopes(obligations: readonly ScopedObligation[]): boolean {
  const opens = obligations.filter((o) => o.intent === "OPEN_REQUEST");
  if (opens.length < 2) return false;
  return !opens.every((o) => sameScope(scopeOf(o), scopeOf(opens[0])));
}

function clauseLocalScope(clause: string): ReasoningScope {
  return extractOne(clause);
}

/**
 * Attach a scope contract to each obligation from its own span/clause.
 * Turn-global extract is a candidate only when language clearly covers
 * the whole turn and no sibling carries a competing local constraint.
 */
export function bindObligationScopes<T extends ScopedObligation>(message: string, obligations: T[]): T[] {
  const split = splitOpenRequestsForScope(message, obligations);
  const opens = split.filter((o) => o.intent === "OPEN_REQUEST");
  const turn = extractOne(message);
  const anyLocal = opens.some((o) => clauseLocalScope(o.sourceSpan?.text ?? o.payload?.normalized ?? "").mode !== "NONE");

  return split.map((o) => {
    if (o.intent !== "OPEN_REQUEST") {
      return { ...o, reasoningScope: NONE_SCOPE };
    }
    const localText = o.sourceSpan?.text ?? o.payload?.normalized ?? "";
    const local = clauseLocalScope(localText);
    if (local.mode !== "NONE") return { ...o, reasoningScope: local };
    if (turn.mode !== "NONE" && !anyLocal && opens.length <= 1) {
      return { ...o, reasoningScope: turn };
    }
    if (turn.mode !== "NONE" && !anyLocal && opens.length > 1) {
      const firstStart = Math.min(...opens.map((x) => x.sourceSpan?.start ?? 0));
      const prefix = message.slice(0, firstStart);
      const prefixScope = extractOne(`${prefix} should I`);
      if (prefixScope.mode !== "NONE") return { ...o, reasoningScope: prefixScope };
    }
    return { ...o, reasoningScope: NONE_SCOPE };
  });
}

function splitOpenRequestsForScope<T extends ScopedObligation>(message: string, obligations: T[]): T[] {
  const out: T[] = [];
  for (const o of obligations) {
    if (o.intent !== "OPEN_REQUEST") {
      out.push(o);
      continue;
    }
    const span = o.sourceSpan;
    const text = span?.text ?? o.payload?.normalized ?? message;
    const clauses = splitRequestClauses(text).filter((c) => isRequestClause(c.text));
    if (clauses.length < 2) {
      out.push(o);
      continue;
    }
    const scopes = clauses.map((c) => clauseLocalScope(c.text));
    if (scopes.every((s) => sameScope(s, scopes[0]))) {
      out.push(o);
      continue;
    }
    const base = span?.start ?? 0;
    clauses.forEach((clause, index) => {
      out.push({
        ...o,
        id: `${o.id}__${index}`,
        payload: { reason: "request_without_dedicated_handler", ...o.payload, normalized: clause.text },
        sourceSpan: {
          start: base + clause.start,
          end: base + clause.end,
          text: clause.text,
        },
        reasoningScope: scopes[index],
      });
    });
  }
  return out;
}

function keysFor(factors: ReasoningFactor[]): Set<ContextKey> {
  const keys = new Set<ContextKey>();
  for (const factor of factors) for (const key of FACTOR_KEYS[factor]) keys.add(key);
  return keys;
}

export function factorAllowed(scope: ReasoningScope, factor: string): boolean {
  if (scope.mode === "NONE") return true;
  if (scope.mode === "ONLY") {
    if ((factor === "rain" || factor === "weather") && (scope.allowedFactors.includes("rain") || scope.allowedFactors.includes("weather"))) {
      return true;
    }
    return scope.allowedFactors.includes(factor as ReasoningFactor);
  }
  return !scope.excludedFactors.includes(factor as ReasoningFactor);
}

function keyAllowed(scope: ReasoningScope, key: string): boolean {
  if (scope.mode === "NONE") return true;
  if (scope.mode === "ONLY") return keysFor(scope.allowedFactors).has(key as ContextKey);
  return !keysFor(scope.excludedFactors).has(key as ContextKey);
}

const NULL_EVIDENCE = {
  recovery: null,
  currentNutritionPlan: null,
  todayFoodLog: null,
  trainingIntelligence: null,
  adaptiveTraining: [] as unknown[],
  dailyPlan: [] as unknown[],
  digitalTwin: null,
  fitnessProfile: null,
  preferences: null,
};

export function restrictUserContext<T extends Record<string, unknown>>(context: T, scope: ReasoningScope): T {
  if (scope.mode === "NONE") return context;
  if (scope.mode === "ONLY") {
    const keep = keysFor(scope.allowedFactors);
    const out = { profile: context.profile ?? null, ...NULL_EVIDENCE } as unknown as T;
    for (const key of keep) (out as Record<string, unknown>)[key] = context[key];
    return out;
  }
  const drop = keysFor(scope.excludedFactors);
  const out = { ...context };
  for (const key of drop) {
    (out as Record<string, unknown>)[key] = Array.isArray(context[key]) ? [] : null;
  }
  return out;
}

/** Per-obligation eligible slice. Shared retrieval stays upstream. */
export function eligibleContextFor<T extends Record<string, unknown>>(context: T, scope: ReasoningScope): T {
  return restrictUserContext(context, scope);
}

export function compactEligibleContext(context: Record<string, unknown>, scope: ReasoningScope): Record<string, unknown> {
  const eligible = eligibleContextFor(context, scope);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(eligible)) {
    if (key === "profile") continue;
    if (value == null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

export function restrictNotes(notes: string[], scope: ReasoningScope): string[] {
  if (scope.mode === "NONE") return notes;
  return notes.filter((note) => !leaksExcluded(note, scope));
}

export function insightAllowed(category: string | undefined, scope: ReasoningScope): boolean {
  if (scope.mode === "NONE" || !category) return true;
  if (scope.mode === "ONLY") {
    if (category === "recovery") return scope.allowedFactors.includes("recovery");
    if (category === "nutrition") {
      return scope.allowedFactors.includes("nutrition") || scope.allowedFactors.includes("protein") || scope.allowedFactors.includes("calories");
    }
    if (category === "training" || category === "progress") {
      return scope.allowedFactors.includes("training_history") || scope.allowedFactors.includes("training_load");
    }
    return false;
  }
  if (category === "recovery") return !scope.excludedFactors.includes("recovery");
  if (category === "nutrition") return !scope.excludedFactors.includes("nutrition") && !scope.excludedFactors.includes("protein");
  if (category === "training" || category === "progress") {
    return !scope.excludedFactors.includes("training_history") && !scope.excludedFactors.includes("training_load");
  }
  return true;
}

function leaksExcluded(text: string, scope: ReasoningScope): boolean {
  if (WEATHER_SAFETY.test(text) && (scope.allowedFactors.includes("weather") || scope.allowedFactors.includes("rain") || scope.mode === "NONE")) {
    if (!LEAK.recovery.test(text) && !LEAK.nutrition.test(text)) return false;
  }
  const blocked = new Set<string>();
  if (scope.mode === "ONLY") {
    const allow = new Set(scope.allowedFactors);
    if (!allow.has("recovery")) blocked.add("recovery");
    if (!allow.has("nutrition") && !allow.has("protein") && !allow.has("calories")) blocked.add("nutrition");
    if (!allow.has("training_load")) blocked.add("training_load");
    if (!allow.has("training_history")) blocked.add("training_history");
    if (!allow.has("goal")) blocked.add("goal");
    blocked.add("alternatives");
  } else if (scope.mode === "EXCLUDE") {
    if (scope.excludedFactors.includes("recovery")) blocked.add("recovery");
    if (scope.excludedFactors.includes("nutrition") || scope.excludedFactors.includes("protein") || scope.excludedFactors.includes("calories")) {
      blocked.add("nutrition");
    }
    if (scope.excludedFactors.includes("training_history")) blocked.add("training_history");
    if (scope.excludedFactors.includes("training_load")) blocked.add("training_load");
    if (scope.excludedFactors.includes("goal")) blocked.add("goal");
  }
  for (const key of blocked) {
    if (LEAK[key]?.test(text)) return true;
  }
  return false;
}

export function isScopedYesNo(message: string, scope: ReasoningScope): boolean {
  if (scope.mode === "NONE") return false;
  return /should i|am i |có nên|co nen|under target|enough reason/i.test(message);
}

export function scopePromptDirective(scope: ReasoningScope, message: string, language: "en" | "vi"): string {
  if (scope.mode === "NONE") return "";
  const allowed = scope.allowedFactors.join(", ") || "(none)";
  const excluded = scope.excludedFactors.join(", ") || "(none)";
  const brevity = isScopedYesNo(message, scope)
    ? language === "vi"
      ? "Câu yes/no này: 1–3 câu ngắn, quyết định trước."
      : "This yes/no: 1–3 short sentences, decision first. No unsolicited alternatives, home workouts, or profile summary."
    : "";
  return [
    "EXPLICIT REASONING SCOPE (P-15)",
    `mode=${scope.mode}; allowed=${allowed}; excluded=${excluded}`,
    "CLIENT PROFILE fields not listed as allowed are ineligible for THIS obligation — do not mention them.",
    "Weather-related safety (lightning, flooding, unsafe travel/visibility) stays in scope when the question is about rain/weather.",
    "Do not apply a sibling obligation's eligible context to this obligation.",
    brevity,
  ].filter(Boolean).join("\n");
}

export function scopedFallback(scope: ReasoningScope, language: "en" | "vi"): string {
  if (scope.allowedFactors.includes("rain") || scope.allowedFactors.includes("weather")) {
    return language === "vi"
      ? "Chỉ xét mưa: không đủ lý do để skip. Đi được an toàn thì đi, không thì nghỉ."
      : "Considering rain only: not enough reason to skip. Go if you can get there safely; skip if travel isn't safe.";
  }
  if (scope.allowedFactors.includes("sleep")) {
    return language === "vi"
      ? "Chỉ xét giấc ngủ: đủ để tập nếu không có tín hiệu an toàn nào khác trong câu hỏi."
      : "Based on sleep alone: that's enough to train unless the question itself reports a safety issue.";
  }
  if (scope.allowedFactors.includes("protein") || scope.allowedFactors.includes("nutrition")) {
    return language === "vi"
      ? "Chỉ xét protein hôm nay: mình cần số đã log và target protein."
      : "Considering today's protein only: I need logged protein vs target.";
  }
  if (scope.allowedFactors.includes("recovery")) {
    return language === "vi"
      ? "Chỉ xét recovery: log điểm recovery và giấc ngủ hôm nay."
      : "Based on recovery: log today's recovery score and sleep.";
  }
  return language === "vi"
    ? "Mình chỉ trả lời trong phạm vi ông đã giới hạn."
    : "I'll stay inside the factor you limited this answer to.";
}

function sentenceList(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
}

export function applyScopeToText(
  text: string,
  scope: ReasoningScope,
  language: "en" | "vi",
  options?: { lexical?: boolean },
): string {
  if (scope.mode === "NONE" || !text.trim()) return text;
  if (options?.lexical === false) return text;
  const kept = sentenceList(text).filter((sentence) => !leaksExcluded(sentence, scope));
  if (kept.length === 0) return scopedFallback(scope, language);
  return kept.join(" ");
}

export function applyScopeToBlocks<T extends { text: string; renderStatus?: string }>(
  blocks: T[],
  scope: ReasoningScope,
  language: "en" | "vi",
): T[] {
  if (scope.mode === "NONE") return blocks;
  return blocks.map((block) => {
    if (block.renderStatus === "DEGRADED") return block;
    const next = applyScopeToText(block.text, scope, language);
    return next === block.text ? block : { ...block, text: next };
  });
}

export function provenanceRefs(scope: ReasoningScope, obligationId: string): string[] {
  if (scope.mode === "NONE") return [];
  const refs = [`scope:obl:${obligationId}`];
  if (scope.mode === "ONLY") {
    for (const factor of scope.allowedFactors) refs.push(`factor:${factor}`);
  }
  return refs;
}

function hasScopeProof(refs: string[]): boolean {
  return refs.some((ref) => ref.startsWith("factor:") || ref.startsWith("context:") || ref.startsWith("scope:obl:"));
}

/** Fail-closed: explicit scope requires provable refs. Missing refs are not "no violation". */
export function blockSupportedByScope(
  block: { semanticRefs?: string[]; obligationId?: string },
  scope: ReasoningScope,
): boolean {
  if (scope.mode === "NONE") return true;
  const refs = block.semanticRefs ?? [];
  if (!hasScopeProof(refs)) return false;
  const owner = block.obligationId;
  if (owner) {
    const bound = refs.filter((ref) => ref.startsWith("scope:obl:"));
    if (bound.length > 0 && !bound.includes(`scope:obl:${owner}`)) return false;
  }
  for (const ref of refs) {
    if (ref.startsWith("factor:") && !factorAllowed(scope, ref.slice("factor:".length))) return false;
    if (ref.startsWith("context:") && !keyAllowed(scope, ref.slice("context:".length))) return false;
  }
  if (scope.mode === "ONLY") {
    return refs.some(
      (ref) =>
        (ref.startsWith("factor:") && factorAllowed(scope, ref.slice("factor:".length))) ||
        (ref.startsWith("context:") && keyAllowed(scope, ref.slice("context:".length))),
    );
  }
  return true;
}

export function stampBlockScopeProvenance<
  T extends { obligationId?: string; semanticRefs?: string[]; renderStatus?: string },
>(blocks: T[], obligations: readonly ScopedObligation[]): T[] {
  const byId = new Map(obligations.map((o) => [o.id, o]));
  const primary = primaryObligationScope(obligations);
  return blocks.map((block) => {
    if (block.renderStatus === "DEGRADED") return block;
    if ((block.obligationId ?? "").startsWith("composed:")) return block;
    const obl = block.obligationId ? byId.get(block.obligationId) : undefined;
    const scope = obl
      ? scopeOf(obl)
      : block.obligationId === "draft"
        ? primary
        : NONE_SCOPE;
    if (scope.mode === "NONE") return block;
    const existing = block.semanticRefs ?? [];
    if (hasScopeProof(existing)) return block;
    return {
      ...block,
      semanticRefs: [...existing, ...provenanceRefs(scope, block.obligationId ?? obl?.id ?? "draft")],
    };
  });
}

export type ObligationEnvelope = {
  obligationId: string;
  question: string;
  scope: { mode: ReasoningScope["mode"]; allowedFactors: ReasoningFactor[]; excludedFactors: ReasoningFactor[] };
  eligibleContext: Record<string, unknown>;
  safety: { weatherSafety: boolean };
  expectedOutputBinding: "obligationId";
};

export function buildObligationEnvelopes(
  open: readonly ScopedObligation[],
  userContext?: Record<string, unknown>,
): ObligationEnvelope[] {
  return open.map((o) => {
    const scope = scopeOf(o);
    return {
      obligationId: o.id,
      question: (o.sourceSpan?.text ?? o.payload?.normalized ?? "").replace(/\s+/g, " ").slice(0, 400),
      scope: { mode: scope.mode, allowedFactors: scope.allowedFactors, excludedFactors: scope.excludedFactors },
      eligibleContext: userContext ? compactEligibleContext(userContext, scope) : {},
      safety: { weatherSafety: scope.allowedFactors.includes("rain") || scope.allowedFactors.includes("weather") },
      expectedOutputBinding: "obligationId",
    };
  });
}

export function parseBoundObligationReplies(raw: string, expectedIds: string[]): Record<string, string> | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const row of parsed) {
      if (!row || typeof row !== "object") return null;
      const rec = row as { obligationId?: unknown; text?: unknown };
      if (typeof rec.obligationId !== "string" || typeof rec.text !== "string") return null;
      out[rec.obligationId] = rec.text;
    }
    if (expectedIds.some((id) => !(id in out))) return null;
    return out;
  } catch {
    return null;
  }
}

export function extractObligationEnvelopesFromPrompt(prompt: string): ObligationEnvelope[] | null {
  const marker = "OBLIGATION_ENVELOPES=";
  const at = prompt.lastIndexOf(marker);
  if (at < 0) return null;
  try {
    return JSON.parse(prompt.slice(at + marker.length).trim()) as ObligationEnvelope[];
  } catch {
    return null;
  }
}

export function applyObligationScopesToBlocks<
  T extends {
    text: string;
    obligationId?: string;
    renderStatus?: string;
    authority?: string;
    verification?: string;
    semanticRefs?: string[];
    degradeReason?: string;
  },
>(
  blocks: T[],
  obligations: readonly ScopedObligation[],
  language: "en" | "vi",
  options?: { lexical?: boolean },
): T[] {
  const byId = new Map(obligations.map((o) => [o.id, o]));
  const primary = primaryObligationScope(obligations);
  return blocks.map((block) => {
    const obl = block.obligationId ? byId.get(block.obligationId) : undefined;
    const scope = obl
      ? scopeOf(obl)
      : block.obligationId === "draft" || (block.obligationId ?? "").startsWith("composed:")
        ? primary
        : NONE_SCOPE;
    if (scope.mode === "NONE") return block;
    if (!blockSupportedByScope(block, scope)) {
      if (block.renderStatus === "DEGRADED") return block;
      return {
        ...block,
        renderStatus: "DEGRADED",
        authority: "UNVERIFIED",
        verification: "FAILED",
        degradeReason: "FAILED_VERIFICATION",
        text: "",
      };
    }
    if (block.renderStatus === "DEGRADED") return block;
    if (options?.lexical === false) return block;
    const next = applyScopeToText(block.text, scope, language);
    return next === block.text ? block : { ...block, text: next };
  });
}

export function splitReplyParts(text: string, count: number): string[] {
  if (count <= 1) return [text];
  const paras = text.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  if (paras.length === count) return paras;
  if (paras.length > count) return [...paras.slice(0, count - 1), paras.slice(count - 1).join(" ")];
  const sentences = sentenceList(text);
  if (sentences.length >= count) {
    const size = Math.ceil(sentences.length / count);
    return Array.from({ length: count }, (_, i) => sentences.slice(i * size, (i + 1) * size).join(" "));
  }
  return Array.from({ length: count }, (_, i) => (i === 0 ? text : ""));
}
