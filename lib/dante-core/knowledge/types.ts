/**
 * Curated RAG Knowledge Base types (spec Part A §7).
 *
 * Separate from lib/evidence/registry.ts (which holds only the
 * specific references lib/training/recommendations.ts cites inline)
 * and separate from the LIVE PubMed/MedlinePlus/USDA retrieval in
 * app/api/chatbot/route.ts (which answers open-ended questions with
 * fresh external search). This registry is a small, hand-curated,
 * offline knowledge base for the fixed set of domains Dante Core's
 * explanations draw on most often, so an explanation never depends on
 * a live network call succeeding and never risks citing something
 * that was never verified.
 */

export type KnowledgeCategory =
  | "hypertrophy"
  | "strength"
  | "recovery"
  | "fatigue"
  | "doms"
  | "sleep"
  | "stress"
  | "hydration"
  | "nutrition"
  | "protein"
  | "technique"
  | "supplements";

export type KnowledgeEntry = {
  id: string;
  title: string;
  authors: string;
  source: string;
  year: number;
  url: string | null;
  category: KnowledgeCategory;
  /** Short, non-technical summary of the takeaway — not the abstract. */
  summary: string;
  /** Lowercase terms this entry should match on during keyword retrieval. */
  keywords: string[];
};
