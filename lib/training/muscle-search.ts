import {
  CANONICAL_MUSCLES,
  MUSCLE_DISPLAY_NAME,
  resolveCanonicalMuscle,
  type CanonicalMuscle,
} from "@/lib/training/muscle-taxonomy";
import { MUSCLE_ATLAS_ENTRIES } from "@/lib/training/muscle-ontology";

/**
 * Muscle Atlas search/resolution — deterministic only, never an LLM
 * call for common lookup (spec: "Do NOT call an LLM for common
 * search"). Pipeline: normalize -> canonical/English alias (reuses
 * `resolveCanonicalMuscle`, does not duplicate its dictionary) ->
 * Vietnamese alias -> fuzzy suggestions. An unresolved query returns
 * suggestions, never a guessed `exact` match.
 */

export type MuscleResolution = {
  exact: CanonicalMuscle | null;
  suggestions: CanonicalMuscle[];
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Seeded conservatively from the Atlas spec's own worked examples plus
 * a handful of other obvious everyday terms — this is NOT a
 * native-speaker-reviewed Vietnamese fitness dictionary, and should be
 * treated as a starting point, not an authoritative translation.
 */
const VIETNAMESE_MUSCLE_ALIASES: Record<string, CanonicalMuscle> = {
  cầu_vai: "trapezius",
  cơ_thang: "trapezius",
  vai_giữa: "lateral_deltoid",
  vai_trước: "anterior_deltoid",
  vai_sau: "rear_deltoid",
  xô: "latissimus_dorsi",
  cơ_lưng_xô: "latissimus_dorsi",
  ngực: "chest",
  cơ_ngực: "chest",
  ngực_trên: "upper_chest",
  tay_trước: "biceps",
  cơ_tay_trước: "biceps",
  tay_sau: "triceps",
  cơ_tay_sau: "triceps",
  cẳng_tay: "forearms",
  đùi_trước: "quadriceps",
  cơ_đùi_trước: "quadriceps",
  đùi_sau: "hamstrings",
  cơ_đùi_sau: "hamstrings",
  mông: "glutes",
  cơ_mông: "glutes",
  bắp_chân: "calves",
  cơ_bắp_chân: "calves",
  bụng: "abdominals",
  cơ_bụng: "abdominals",
  lưng_dưới: "lower_back",
  cơ_lưng_dưới: "lower_back",
  lưng_trên: "upper_back",
};

function resolveVietnameseAlias(normalizedQuery: string): CanonicalMuscle | null {
  return VIETNAMESE_MUSCLE_ALIASES[normalizedQuery] ?? null;
}

/** Every searchable term for a muscle: display name, English aliases, Vietnamese aliases — all normalized. */
function searchableTermsFor(muscle: CanonicalMuscle): string[] {
  const entry = MUSCLE_ATLAS_ENTRIES[muscle];
  const terms = [MUSCLE_DISPLAY_NAME[muscle], ...entry.commonAliases, ...entry.vietnameseAliases];
  return terms.map(normalize);
}

/** Classic Levenshtein edit distance — fine at this vocabulary size (a few dozen short terms), no library needed. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) distances[i][0] = i;
  for (let j = 0; j < cols; j += 1) distances[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1,
        distances[i][j - 1] + 1,
        distances[i - 1][j - 1] + cost,
      );
    }
  }

  return distances[rows - 1][cols - 1];
}

const MAX_FUZZY_DISTANCE = 3;
const MAX_SUGGESTIONS = 5;

function fuzzySuggestions(normalizedQuery: string): CanonicalMuscle[] {
  if (normalizedQuery.length < 2) {
    return [];
  }

  const scored: Array<{ muscle: CanonicalMuscle; score: number }> = [];

  for (const muscle of CANONICAL_MUSCLES) {
    let best = Infinity;

    for (const term of searchableTermsFor(muscle)) {
      if (term.includes(normalizedQuery) || normalizedQuery.includes(term)) {
        best = 0;
        break;
      }

      const distance = levenshtein(normalizedQuery, term);
      const threshold = Math.min(MAX_FUZZY_DISTANCE, Math.ceil(term.length / 2));

      if (distance <= threshold && distance < best) {
        best = distance;
      }
    }

    if (best < Infinity) {
      scored.push({ muscle, score: best });
    }
  }

  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.muscle);
}

export function resolveMuscleQuery(query: string): MuscleResolution {
  const trimmed = query.trim();

  if (!trimmed) {
    return { exact: null, suggestions: [] };
  }

  const exactByTaxonomy = resolveCanonicalMuscle(trimmed);
  if (exactByTaxonomy) {
    return { exact: exactByTaxonomy, suggestions: [] };
  }

  const normalized = normalize(trimmed);

  const exactByVietnamese = resolveVietnameseAlias(normalized);
  if (exactByVietnamese) {
    return { exact: exactByVietnamese, suggestions: [] };
  }

  return { exact: null, suggestions: fuzzySuggestions(normalized) };
}
