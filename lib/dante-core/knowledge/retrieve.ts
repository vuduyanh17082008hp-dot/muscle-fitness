import { KNOWLEDGE_REGISTRY } from "@/lib/dante-core/knowledge/registry";
import type {
  KnowledgeCategory,
  KnowledgeEntry,
} from "@/lib/dante-core/knowledge/types";

/**
 * Retrieval (spec Part A §7).
 *
 * KNOWN LIMITATION, stated plainly: this is keyword-overlap scoring
 * over a small hand-curated list, NOT semantic/embedding-based
 * search. It is intentionally simple because the knowledge base is
 * small enough (a few dozen entries) that keyword matching is
 * reliable, auditable, and requires no vector database. If the
 * registry grows substantially, replace this with real embedding
 * retrieval — but do not present this function's ranking as semantic
 * similarity, because it isn't.
 */

export type RetrievedKnowledge = {
  entry: KnowledgeEntry;
  score: number;
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "over",
  "than",
  "then",
  "your",
  "you",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "not",
  "but",
  "can",
  "will",
  "may",
  "per",
  "how",
  "what",
  "when",
  "does",
  "each",
  "such",
  "more",
  "most",
  "some",
  "any",
  "all",
  "its",
  "their",
  "about",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/**
 * Scores an entry against a query by counting keyword hits (each
 * keyword may be a multi-word phrase, matched as a substring of the
 * lowercased query) plus a smaller bonus for individual token overlap
 * against the entry's title/summary. Returns 0 for no overlap at all.
 */
function scoreEntry(entry: KnowledgeEntry, query: string): number {
  const lowerQuery = query.toLowerCase();
  let score = 0;

  for (const keyword of entry.keywords) {
    if (lowerQuery.includes(keyword)) {
      score += 3;
    }
  }

  const queryTokens = new Set(tokenize(query));
  const titleTokens = tokenize(entry.title + " " + entry.summary);

  for (const token of titleTokens) {
    if (queryTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

export function retrieveKnowledge(
  query: string,
  options: { category?: KnowledgeCategory; limit?: number } = {},
): RetrievedKnowledge[] {
  const limit = options.limit ?? 3;

  const candidates = options.category
    ? KNOWLEDGE_REGISTRY.filter((entry) => entry.category === options.category)
    : KNOWLEDGE_REGISTRY;

  return candidates
    .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function retrieveByCategory(
  category: KnowledgeCategory,
  limit = 3,
): KnowledgeEntry[] {
  return KNOWLEDGE_REGISTRY.filter((entry) => entry.category === category).slice(
    0,
    limit,
  );
}
