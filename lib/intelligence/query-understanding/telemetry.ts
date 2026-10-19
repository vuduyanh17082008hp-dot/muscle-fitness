import type { QueryDiagnostics } from "./diagnostics";

/**
 * Privacy-safe in-memory counters for the shared query layer (enums/counts only — no text, no foods, no Athlete State,
 * no reasoning). Mirrors the nutrition orchestration telemetry: nothing is persisted or sent anywhere.
 * QUERY_UNDERSTANDING_TELEMETRY=1 (non-production) also prints each event.
 */
const counts: Record<string, number> = {};
const bump = (key: string) => { counts[key] = (counts[key] ?? 0) + 1; };

export function recordQueryDiagnostics(surface: "DANTE" | "GEMMA", d: QueryDiagnostics, extra: { usda?: string; local?: boolean; latencyMs?: number } = {}): void {
  bump(`${surface}.turns`);
  bump(`intent.${d.QUERY_FRAME_BUILT.intent}`);
  bump(`route.${d.RETRIEVAL_ROUTE_SELECTED.route}`);
  if (d.REFERENCE_RESOLVED.fromHistory) bump("reference.resolved");
  if (d.AMBIGUITY_DETECTED.present) bump("ambiguity");
  if (d.CROSS_DOMAIN_RELEVANCE.relevance === "MATERIAL" || d.CROSS_DOMAIN_RELEVANCE.relevance === "CRITICAL") bump("cross_domain");
  if (extra.usda) bump(`usda.${extra.usda}`);
  if (extra.local !== undefined) bump(extra.local ? "local.hit" : "local.miss");
  if (process.env.NODE_ENV !== "production" && process.env.QUERY_UNDERSTANDING_TELEMETRY === "1") {
    console.debug("[query-understanding]", JSON.stringify({ surface, ...d, ...extra }));
  }
}

export const getQueryMetrics = () => ({ ...counts });
export function resetQueryMetrics(): void { for (const k of Object.keys(counts)) delete counts[k]; }
