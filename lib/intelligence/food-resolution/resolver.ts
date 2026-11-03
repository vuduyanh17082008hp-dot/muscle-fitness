import type {
  FoodBasis, FoodCandidate, FoodResolutionDiagnostics, LocalFoodHit, ResolvedFood, ResolveRequest, ResolverDeps, UsdaStatus,
} from "./types";

const ATTRIBUTION = "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, fdc.nal.usda.gov.";
const MIN_USDA_SCORE = 40;
/** raw vs cooked calories differ by more than this share → the choice materially changes the answer. */
const AMBIGUITY_CALORIE_SPREAD = 0.2;

const DISH_WORDS = ["sandwich", "dinner", "meal", "snack", "dessert", "flavored", "candy", "pie", "cake", "chips", "sauce", "soup", "pizza", "salad", "casserole", "stew", "nuggets", "sticks", "patty", "breaded", "battered", "canned", "smoked", "dried", "pickled", "salted"];
const COOKED_STATES = new Set(["cooked", "grilled", "baked", "boiled", "steamed", "fried", "roasted", "poached"]);

/** Words that describe the cut/form, not a different food ("cod fish", "salmon fillet"). */
const NEUTRAL_WORDS = new Set(["fish", "fillet", "fillets", "meat", "fresh", "piece", "pieces"]);
const COMMON_VARIETY_HINTS = ["atlantic", "farm", "all varieties"]
const tokens = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
const singular = (t: string) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);

/**
 * Cooking methods by how they cook: dry heat adds nothing, moist heat cooks in water, frying adds oil. A record cooked in
 * another group is a different preparation ("grilled" breast is never the "braised" record), so it cannot be chosen.
 */
const METHOD_GROUP: Record<string, "dry" | "moist" | "fried"> = {
  grilled: "dry", broiled: "dry", roasted: "dry", baked: "dry", rotisserie: "dry", dry: "dry",
  boiled: "moist", stewed: "moist", braised: "moist", poached: "moist", simmered: "moist", steamed: "moist", moist: "moist",
  fried: "fried",
};
function methodConflicts(preparation: string | undefined, desc: string[]): boolean {
  const want = preparation ? METHOD_GROUP[preparation.toLowerCase()] : undefined;
  if (!want) return false;
  const have = new Set(desc.flatMap((t) => (METHOD_GROUP[t] ? [METHOD_GROUP[t]] : [])));
  return have.size > 0 && !have.has(want);
}

/** Tokens that make the request more specific than the generic base ("atlantic" in "atlantic cod"). */
export function varietyTokens(req: ResolveRequest): string[] {
  const core = tokens(req.base ?? req.text).map(singular);
  return tokens(req.text).map(singular).filter((t) => !core.includes(t) && !NEUTRAL_WORDS.has(t));
}

export function wantedState(preparation?: string): FoodBasis | null {
  if (!preparation) return null;
  const p = preparation.toLowerCase();
  if (p === "raw") return "raw";
  return COOKED_STATES.has(p) ? "cooked" : null;
}

/**
 * Specificity-aware USDA ranking (never "first result wins"). A candidate must contain every core token of the
 * generic food; variety and preparation then move it up or down. Returns -Infinity for non-matches.
 */
export function scoreUsdaCandidate(candidate: FoodCandidate, req: ResolveRequest, softBasis?: FoodBasis): number {
  const desc = tokens(candidate.name).map(singular);
  const core = tokens(req.base ?? req.text).map(singular);
  if (core.length === 0 || !core.every((t) => desc.includes(t))) return -Infinity;
  if (methodConflicts(req.preparation, desc)) return -Infinity;
  const all = tokens(req.text).map(singular);
  const variety = varietyTokens(req);
  let score = 40;
  for (const t of variety) score += desc.includes(t) ? 20 : -10;
  const want = wantedState(req.preparation);
  if (want) score += candidate.basis === want ? 25 : candidate.basis === "unknown" ? 0 : -25;
  // No preparation stated: stay consistent with how the app's own generic entry is measured (the "as eaten" basis).
  else if (softBasis && softBasis !== "unknown") score += candidate.basis === softBasis ? 12 : candidate.basis === "unknown" ? 0 : -12;
  if (candidate.confidence === "high") score += 10
  // A generic query ("salmon") with several valid varieties: prefer the commonly eaten record over an obscure one. Small on
  // purpose — it only breaks ties; every real signal above (variety, preparation, dish noise) outweighs it.
  if (variety.length === 0) for (const hint of COMMON_VARIETY_HINTS) if (candidate.name.toLowerCase().includes(hint)) score += 3;
  if (candidate.brand) score -= 15;
  for (const word of DISH_WORDS) if (desc.includes(word) && !all.includes(word)) score -= 20;
  // Prefer the canonical, shorter description.
  score -= Math.max(0, candidate.name.length - 40) * 0.1;
  return score;
}

/**
 * Frying adds oil and usually a coating, so it changes the food, not just its state: a record that was not fried (plain cooked
 * or grilled chicken breast) can never answer a fried request. The dry methods (grilled, baked, boiled, steamed, roasted,
 * poached) add no fat and stay on the existing raw/cooked path.
 */
const FAT_ADDING_METHODS = new Set(["fried"]);
/** A cut changes the food too: "fried chicken" is not a fried breast, and a breast is not mixed pieces. */
const CUT_WORDS = ["breast", "thigh", "drumstick", "wing", "leg", "back", "neck"];
/** Restaurant records ("KFC, Fried Chicken, ...") are that brand's product, never a generic reference. */
const BRAND_RECORD = /^[A-Z][A-Z'&. ]{2,},/;
const NO_COATING = /\b(?:meat only|unbreaded|naked|breading removed|(?:no|without)(?: the)?(?: skin(?: or| and|,))? (?:breading|batter))\b/;
const COATED = /\b(?:batter(?:ed)?|bread(?:ed|ing)|coated|crispy)\b/;
const NO_SKIN = /\b(?:skinless|no skin|without (?:the )?skin)\b/;
const COATING_OPTIONS = ["breaded, with skin", "skinless, no breading"];

/** Coating of a record or of the user's words. "Meat only, no skin or batter" names the batter it lacks, so that is checked first. */
export function coatingOf(text: string): "coated" | "plain" | undefined {
  const t = text.toLowerCase();
  if (NO_COATING.test(t)) return "plain";
  if (COATED.test(t)) return "coated";
  return NO_SKIN.test(t) ? "plain" : undefined;
}

async function resolveFried(req: ResolveRequest, deps: ResolverDeps, base: string, diagnostics: FoodResolutionDiagnostics, now: () => number): Promise<ResolvedFood> {
  const reasons = ["requested_fried"];
  const core = tokens(base).map(singular);
  const asked = tokens(`${req.text} ${base}`).map(singular);
  const fits = (c: FoodCandidate) => {
    const desc = tokens(c.name).map(singular);
    return core.every((t) => desc.includes(t)) && desc.includes("fried") && !BRAND_RECORD.test(c.name) && CUT_WORDS.every((cut) => desc.includes(cut) === asked.includes(cut));
  };
  let pool = (deps.searchPrepared?.(base, "fried") ?? []).filter(fits);
  if (pool.length) reasons.push("usda_offline_copy");
  else {
    const start = now();
    let status: UsdaStatus = "NO_RESULT";
    try {
      const res = await deps.searchUsda(`${req.text} fried`);
      status = !res.configured ? "NOT_CONFIGURED" : res.foods.length ? "OK" : "NO_RESULT";
      pool = res.foods.filter(fits);
    } catch {
      reasons.push("usda_lookup_failed");
    }
    diagnostics.USDA_LOOKUP = { status, candidates: pool.length, latencyMs: Math.max(0, now() - start) };
  }
  const want = req.coating ?? coatingOf(req.text);
  if (want) pool = pool.filter((c) => (coatingOf(c.name) ?? want) === want);
  // Shortest description = the plain generic record; ties broken by id so the same request always picks the same record.
  pool.sort((a, b) => a.name.length - b.name.length || a.id.localeCompare(b.id));
  if (!pool.length) {
    reasons.push("no_fried_record");
    return { status: "UNRESOLVED", source: "NONE", name: null, basis: "unknown", per100g: null, reasons, diagnostics };
  }
  if (!want) {
    const coated = pool.find((c) => coatingOf(c.name) === "coated")?.per100g.calories;
    const plain = pool.find((c) => coatingOf(c.name) === "plain")?.per100g.calories;
    if (coated && plain && Math.abs(coated - plain) / Math.max(coated, plain) > AMBIGUITY_CALORIE_SPREAD) {
      return { status: "AMBIGUOUS", source: "NONE", name: null, basis: "unknown", per100g: null, reasons: [...reasons, "coating_changes_answer"], clarification: { field: "coating", options: COATING_OPTIONS }, diagnostics };
    }
  }
  reasons.push(`coating_${want ?? coatingOf(pool[0].name) ?? "unknown"}`);
  return fromUsda(pool[0], reasons, diagnostics);
}

const unknownDiagnostics = (): FoodResolutionDiagnostics => ({ LOCAL_LOOKUP: { hit: false, latencyMs: 0 }, USDA_LOOKUP: { status: "SKIPPED", candidates: 0, latencyMs: 0 } });

function fromLocal(hit: LocalFoodHit, reasons: string[], diagnostics: FoodResolutionDiagnostics, status: ResolvedFood["status"] = hit.verification): ResolvedFood {
  return { status, source: "LOCAL_CANONICAL", name: hit.name, basis: hit.basis, per100g: hit.per100g, sourceId: hit.id, reasons, diagnostics };
}
function fromUsda(c: FoodCandidate, reasons: string[], diagnostics: FoodResolutionDiagnostics): ResolvedFood {
  return { status: "VERIFIED", source: "USDA_FDC", name: c.name, basis: c.basis, per100g: c.per100g, sourceId: c.id, attribution: ATTRIBUTION, reasons, diagnostics };
}

/**
 * ONE canonical food resolver (Gemma owns nutrition decisions; Dante may read through it).
 *   local canonical → USDA when specificity or coverage requires it → rank → ambiguity → provenance.
 * Specificity rule: a generic query ("cod") is served by the local table; a more specific one ("Atlantic cod",
 * "raw cod" when local is cooked) prefers a matching USDA record, and falls back to local if USDA is unavailable.
 * Never throws; every degradation is reported in `reasons`.
 */
export async function resolveFoodEntity(req: ResolveRequest, deps: ResolverDeps): Promise<ResolvedFood> {
  const resolved = await resolveGeneric(req, deps);
  // A generic record standing in for a restaurant's item is an estimate of that item, never its official nutrition.
  if (!req.brand || !resolved.per100g) return resolved;
  return { ...resolved, status: "ESTIMATED", genericFor: req.brand, reasons: [...resolved.reasons, "generic_reference_for_brand"] };
}

async function resolveGeneric(req: ResolveRequest, deps: ResolverDeps): Promise<ResolvedFood> {
  const now = deps.now ?? Date.now;
  const diagnostics = unknownDiagnostics();
  const base = (req.base ?? req.text).toLowerCase().trim();
  const reasons: string[] = [];
  if (!base) return { status: "UNRESOLVED", source: "NONE", name: null, basis: "unknown", per100g: null, reasons: ["empty_query"], diagnostics };
  if (req.preparation && FAT_ADDING_METHODS.has(req.preparation.toLowerCase())) return resolveFried(req, deps, base, diagnostics, now);

  let local: LocalFoodHit | null = null;
  const localStart = now();
  try {
    local = deps.searchLocal(base);
  } catch {
    reasons.push("local_lookup_failed");
  }
  diagnostics.LOCAL_LOOKUP = { hit: local !== null, latencyMs: Math.max(0, now() - localStart) };

  const variety = varietyTokens(req);
  const hasVariety = variety.length > 0;
  const want = wantedState(req.preparation);
  const prepMismatch = Boolean(local && want && local.basis !== "unknown" && local.basis !== want);
  const needUsda = !local || hasVariety || prepMismatch;

  let ranked: Array<{ candidate: FoodCandidate; score: number }> = [];
  let usdaStatus: UsdaStatus = "SKIPPED";
  const usdaStart = now();
  if (needUsda) {
    try {
      const query = [req.text, want === "raw" ? "raw" : req.preparation && want === "cooked" ? req.preparation : ""].filter(Boolean).join(" ");
      const res = await deps.searchUsda(query);
      usdaStatus = !res.configured ? "NOT_CONFIGURED" : res.foods.length ? "OK" : "NO_RESULT";
      ranked = res.foods
        .map((candidate) => ({ candidate, score: scoreUsdaCandidate(candidate, req, req.referenceBasis ?? local?.basis) }))
        .filter((r) => r.score >= MIN_USDA_SCORE)
        .sort((a, b) => b.score - a.score || a.candidate.name.length - b.candidate.name.length || a.candidate.id.localeCompare(b.candidate.id)); // deterministic: USDA's own ordering varies between calls
    } catch {
      usdaStatus = "NO_RESULT";
      reasons.push("usda_lookup_failed");
    }
  }
  diagnostics.USDA_LOOKUP = { status: usdaStatus, candidates: ranked.length, latencyMs: Math.max(0, now() - usdaStart) };

  const best = ranked[0]?.candidate;
  const bestHasVariety = best ? variety.every((t) => tokens(best.name).map(singular).includes(t)) : false;

  // Raw vs cooked matters only when we are about to scale a weight and the user did not say which.
  if (!local && best && !want && !req.referenceBasis && req.quantityGrams) {
    const other = ranked.find((r) => r.candidate.basis !== best.basis && r.candidate.basis !== "unknown");
    const a = best.per100g.calories;
    const b = other?.candidate.per100g.calories;
    if (other && a && b && Math.abs(a - b) / Math.max(a, b) > AMBIGUITY_CALORIE_SPREAD) {
      return { status: "AMBIGUOUS", source: "NONE", name: null, basis: "unknown", per100g: null, reasons: ["raw_vs_cooked_changes_answer"], clarification: { field: "preparation", options: ["raw", "cooked"] }, diagnostics };
    }
  }

  if (local && best && ((hasVariety && bestHasVariety) || (!hasVariety && prepMismatch))) {
    reasons.push(hasVariety ? "usda_more_specific_than_local" : "usda_matches_requested_preparation");
    return fromUsda(best, reasons, diagnostics);
  }
  if (local && best && hasVariety && !bestHasVariety && !prepMismatch) reasons.push("variety_not_in_usda_using_generic_local");
  if (local) {
    if (needUsda && !best) reasons.push(usdaStatus === "NOT_CONFIGURED" ? "usda_not_configured" : "usda_no_better_match");
    if (prepMismatch) {
      // Local numbers are for a different state than asked; say so rather than present them as exact.
      reasons.push(`requested_${want}_local_is_${local.basis}`);
      return fromLocal(local, reasons, diagnostics, "ESTIMATED");
    }
    reasons.push("local_canonical");
    return fromLocal(local, reasons, diagnostics);
  }
  if (best) {
    reasons.push(hasVariety && !bestHasVariety ? "usda_generic_match_variety_not_found" : "usda_ranked_match");
    return fromUsda(best, reasons, diagnostics);
  }
  reasons.push(usdaStatus === "NOT_CONFIGURED" ? "usda_not_configured" : "no_source_match");
  return { status: "UNRESOLVED", source: "NONE", name: null, basis: "unknown", per100g: null, reasons, diagnostics };
}
