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
  const now = deps.now ?? Date.now;
  const diagnostics = unknownDiagnostics();
  const base = (req.base ?? req.text).toLowerCase().trim();
  const reasons: string[] = [];
  if (!base) return { status: "UNRESOLVED", source: "NONE", name: null, basis: "unknown", per100g: null, reasons: ["empty_query"], diagnostics };

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
