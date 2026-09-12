import type { KnowledgeEntry } from "@/lib/dante-core/knowledge/types";

/**
 * Curated Knowledge Registry (spec Part A §7).
 *
 * Every entry below is a real, checkable publication. `url` is left
 * `null` throughout rather than guessing at an exact DOI/PMID link —
 * title + authors + source + year is enough for a user or developer
 * to verify the source themselves, and an invented link would be
 * worse than no link. Do not add an entry here unless you can name
 * the actual paper; if in doubt, leave the category thinner instead
 * (see docs/dante-core.md's "Known limitations" section — "technique"
 * coverage is intentionally sparse for exactly this reason).
 */

export const KNOWLEDGE_REGISTRY: KnowledgeEntry[] = [
  {
    id: "schoenfeld-2017-volume-hypertrophy",
    title:
      "Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis",
    authors: "Schoenfeld BJ, Ogborn D, Krieger JW",
    source: "Journal of Sports Sciences",
    year: 2017,
    url: null,
    category: "hypertrophy",
    summary:
      "Higher weekly training volume (more sets per muscle per week) is associated with greater hypertrophy up to a point, but the relationship shows diminishing returns rather than being linear.",
    keywords: [
      "volume",
      "sets",
      "hypertrophy",
      "muscle growth",
      "weekly volume",
      "training volume",
    ],
  },
  {
    id: "pelland-2025-volume-dose-response",
    title:
      "The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains",
    authors: "Pelland JC, et al.",
    source: "Sports Medicine",
    year: 2025,
    url: null,
    category: "hypertrophy",
    summary:
      "Weekly volume and frequency both show dose-response relationships with hypertrophy and strength, with diminishing marginal returns and meaningful individual variation — no single 'optimal' number applies universally.",
    keywords: [
      "volume",
      "frequency",
      "hypertrophy",
      "strength",
      "dose response",
    ],
  },
  {
    id: "jager-2017-issn-protein",
    title: "International Society of Sports Nutrition Position Stand: protein and exercise",
    authors: "Jäger R, Kerksick CM, Campbell BI, et al.",
    source: "Journal of the International Society of Sports Nutrition",
    year: 2017,
    url: null,
    category: "protein",
    summary:
      "Most exercising individuals benefit from roughly 1.4-2.0 g/kg/day of protein, distributed across multiple meals, to support muscle protein synthesis and recovery; needs can be higher during caloric restriction.",
    keywords: [
      "protein",
      "protein intake",
      "muscle protein synthesis",
      "grams per kilogram",
      "protein distribution",
    ],
  },
  {
    id: "kreider-2017-issn-creatine",
    title:
      "International Society of Sports Nutrition position stand: safety and efficacy of creatine supplementation in exercise, sport, and medicine",
    authors: "Kreider RB, et al.",
    source: "Journal of the International Society of Sports Nutrition",
    year: 2017,
    url: null,
    category: "supplements",
    summary:
      "Creatine monohydrate is one of the most-studied and consistently safe/effective supplements for improving high-intensity exercise performance and supporting training adaptations, at typical doses (e.g. 3-5 g/day maintenance).",
    keywords: [
      "creatine",
      "creatine monohydrate",
      "supplement",
      "supplementation",
      "performance",
    ],
  },
  {
    id: "guest-2021-issn-caffeine",
    title:
      "International society of sports nutrition position stand: caffeine and exercise performance",
    authors: "Guest NS, et al.",
    source: "Journal of the International Society of Sports Nutrition",
    year: 2021,
    url: null,
    category: "supplements",
    summary:
      "Caffeine (roughly 3-6 mg/kg body mass) can modestly improve exercise performance for many people, with meaningful individual variation in response and sensitivity, and diminishing benefit with habitual high intake.",
    keywords: ["caffeine", "supplement", "stimulant", "pre-workout"],
  },
  {
    id: "hirshkowitz-2015-sleep-duration",
    title:
      "National Sleep Foundation's sleep time duration recommendations: methodology and results summary",
    authors: "Hirshkowitz M, et al.",
    source: "Sleep Health",
    year: 2015,
    url: null,
    category: "sleep",
    summary:
      "Most healthy adults need roughly 7-9 hours of sleep per night; consistently sleeping outside this range is associated with worse recovery and health outcomes, though individual needs vary somewhat.",
    keywords: [
      "sleep",
      "sleep duration",
      "hours of sleep",
      "sleep recommendation",
    ],
  },
  {
    id: "kellmann-2018-recovery-consensus",
    title: "Recovery and Performance in Sport: Consensus Statement",
    authors: "Kellmann M, et al.",
    source: "International Journal of Sports Physiology and Performance",
    year: 2018,
    url: null,
    category: "recovery",
    summary:
      "Recovery is multidimensional (physiological, psychological, social) and under-recovery relative to training load is a primary driver of overreaching/overtraining — monitoring should combine multiple simple markers rather than one single number.",
    keywords: [
      "recovery",
      "overtraining",
      "overreaching",
      "training load",
      "monitoring",
    ],
  },
  {
    id: "mcewen-1998-allostatic-load",
    title: "Protective and damaging effects of stress mediators",
    authors: "McEwen BS",
    source: "New England Journal of Medicine",
    year: 1998,
    url: null,
    category: "stress",
    summary:
      "Chronic stress produces cumulative physiological wear ('allostatic load') that can impair recovery and health over time, distinct from the short-term, adaptive stress response to a single training session.",
    keywords: ["stress", "chronic stress", "allostatic load", "cortisol"],
  },
  {
    id: "cheung-2003-doms",
    title: "Delayed onset muscle soreness: treatment strategies and performance factors",
    authors: "Cheung K, Hume PA, Maxwell L",
    source: "Sports Medicine",
    year: 2003,
    url: null,
    category: "doms",
    summary:
      "Delayed-onset muscle soreness (DOMS) typically peaks 24-72 hours after unfamiliar or eccentric-heavy exercise and resolves on its own; no treatment studied has been shown to reliably prevent it, though light activity can ease symptoms.",
    keywords: [
      "doms",
      "muscle soreness",
      "delayed onset muscle soreness",
      "sore muscles",
      "eccentric",
    ],
  },
  {
    id: "zourdos-2016-rir-rpe-scale",
    title:
      "Novel Resistance Training-Specific Rating of Perceived Exertion Scale Measuring Repetitions in Reserve",
    authors: "Zourdos MC, et al.",
    source: "Journal of Strength and Conditioning Research",
    year: 2016,
    url: null,
    category: "strength",
    summary:
      "A Repetitions-in-Reserve (RIR) based RPE scale lets lifters estimate proximity to failure reasonably reliably, providing a practical way to autoregulate training intensity without requiring true 1RM testing every session.",
    keywords: [
      "rir",
      "rpe",
      "repetitions in reserve",
      "autoregulation",
      "perceived exertion",
    ],
  },
  {
    id: "sawka-2007-acsm-fluid-replacement",
    title: "American College of Sports Medicine position stand: Exercise and fluid replacement",
    authors: "Sawka MN, et al.",
    source: "Medicine & Science in Sports & Exercise",
    year: 2007,
    url: null,
    category: "hydration",
    summary:
      "Even modest dehydration (around 2% of body mass) can impair exercise performance and increase perceived effort; fluid needs vary widely by individual, climate, and exercise intensity rather than following one fixed number.",
    keywords: [
      "hydration",
      "fluid replacement",
      "dehydration",
      "water intake",
      "electrolytes",
    ],
  },
];

export function getKnowledgeEntryById(id: string): KnowledgeEntry | null {
  return KNOWLEDGE_REGISTRY.find((entry) => entry.id === id) ?? null;
}
