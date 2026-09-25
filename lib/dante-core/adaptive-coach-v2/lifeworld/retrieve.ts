import { normalizeSafetyText } from "@/lib/dante-core/safety-layer";
import { LIFEWORLD_PATTERNS } from "@/lib/dante-core/adaptive-coach-v2/lifeworld/patterns";
import type { LifeWorldPattern } from "@/lib/dante-core/adaptive-coach-v2/lifeworld/types";

export function retrieveLifeWorldPatterns(query: string, limit = 3): LifeWorldPattern[] {
  const safeLimit = Math.min(8, Math.max(3, Math.floor(limit)));
  const normalized = normalizeSafetyText(query);
  return LIFEWORLD_PATTERNS
    .map((pattern) => ({
      pattern,
      score: pattern.triggers.reduce((total, trigger) =>
        total + (normalized.includes(normalizeSafetyText(trigger)) ? 1 : 0), 0),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.pattern.id.localeCompare(right.pattern.id))
    .slice(0, safeLimit)
    .map((item) => ({ ...item.pattern, authority: "STYLE_CONTEXT_ONLY" }));
}
