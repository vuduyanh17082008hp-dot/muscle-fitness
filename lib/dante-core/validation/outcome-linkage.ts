export type LinkableRecommendation = {
  userId: string;
  recommendationId: string;
  occurredAt: string;
  horizonStartMs: number;
  horizonEndMs: number;
  linked: boolean;
};

/** Explicit ID wins. Without it, ambiguity stays unresolved rather than guessed. */
export function selectOutcomeLink(input: {
  userId: string;
  outcomeAt: Date;
  recommendations: LinkableRecommendation[];
  explicitRecommendationId?: string;
}): LinkableRecommendation | null {
  const eligible = input.recommendations.filter((item) => {
    if (item.userId !== input.userId || item.linked) return false;
    const age = input.outcomeAt.getTime() - new Date(item.occurredAt).getTime();
    return age >= item.horizonStartMs && age <= item.horizonEndMs;
  });
  if (input.explicitRecommendationId) {
    return eligible.find((item) => item.recommendationId === input.explicitRecommendationId) ?? null;
  }
  return eligible.length === 1 ? eligible[0] : null;
}
