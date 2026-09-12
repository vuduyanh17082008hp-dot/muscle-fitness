import { callGroqWithFallback } from "@/lib/dante-core/llm-client";
import { retrieveKnowledge } from "@/lib/dante-core/knowledge/retrieve";
import type {
  KnowledgeSourceRef,
  TraceableDecision,
} from "@/lib/dante-core/types";

/**
 * Dante Response Architecture (spec Part A §9).
 *
 * FACTS + DECISION are already fully computed before this file is
 * ever reached (readiness-engine / autoregulation-engine /
 * decision-object). This module's only job is EXPLANATION: turn an
 * already-final TraceableDecision into natural language, with
 * SOURCES pulled from the curated knowledge base. The LLM is
 * instructed, explicitly and repeatedly in the prompt, never to
 * change or re-derive any number — it explains what's already true.
 */

const EXPLANATION_INSTRUCTIONS = `You are Dante, the training-intelligence voice of Muscle Fitness.

You are given a DECISION that was already computed deterministically by a
rule engine — not by you. Your only job is to explain it clearly and
briefly in natural language.

STRICT RULES:
- Do not invent, recompute, or adjust any number in DECISION or DATA. Use
  them exactly as given.
- Do not add new reasons beyond WHY. You may rephrase WHY for clarity, but
  do not introduce a claim that isn't already there.
- If SOURCES is non-empty, you may reference it briefly (e.g. "research on
  training volume suggests..."), but do not claim a source says something
  it doesn't, and do not add citations that are not in SOURCES.
- Keep the explanation to 2-4 short sentences. This is a training
  recommendation, not a medical diagnosis — do not use diagnostic language.
- Write in English unless the RECOMMENDATION/WHY text is in another
  language, in which case match that language.`;

function buildExplanationPrompt(
  decision: TraceableDecision<unknown>,
): string {
  return [
    EXPLANATION_INSTRUCTIONS,
    "============================================================",
    "RECOMMENDATION",
    "============================================================",
    decision.recommendation,
    "============================================================",
    "WHY",
    "============================================================",
    decision.why.length > 0
      ? decision.why.map((reason) => `- ${reason}`).join("\n")
      : "(no specific factors flagged)",
    "============================================================",
    "DATA",
    "============================================================",
    JSON.stringify(decision.dataUsed, null, 2),
    "============================================================",
    "CONFIDENCE",
    "============================================================",
    decision.confidence,
    "============================================================",
    "SOURCES",
    "============================================================",
    decision.sources.length > 0
      ? decision.sources
          .map((s) => `- ${s.title} (${s.authors}, ${s.source}, ${s.year})`)
          .join("\n")
      : "(none)",
  ].join("\n");
}

export type ExplainedDecision<TDecision> = {
  decision: TraceableDecision<TDecision>;
  explanation: string;
  explanationSource: "llm" | "fallback";
};

/**
 * Attaches a curated knowledge-base sources list to a TraceableDecision
 * by retrieving against its `why` reasons text, WITHOUT mutating the
 * underlying decision object.
 */
export function attachKnowledgeSources<TDecision>(
  decision: TraceableDecision<TDecision>,
  queryHint: string,
): TraceableDecision<TDecision> {
  const retrieved = retrieveKnowledge(queryHint, { limit: 2 });

  if (retrieved.length === 0) {
    return decision;
  }

  const sources: KnowledgeSourceRef[] = retrieved.map(({ entry }) => ({
    id: entry.id,
    title: entry.title,
    authors: entry.authors,
    source: entry.source,
    year: entry.year,
    url: entry.url,
  }));

  return { ...decision, sources: [...decision.sources, ...sources] };
}

/**
 * explainRecommendation() — spec §27's `dante.explainRecommendation()`.
 *
 * Never throws on an LLM failure: falls back to a plain-text render
 * of WHY/CONFIDENCE so the user always gets a real, traceable
 * explanation even if Groq is unreachable.
 */
export async function explainRecommendation<TDecision>(
  decision: TraceableDecision<TDecision>,
): Promise<ExplainedDecision<TDecision>> {
  const fallbackExplanation = [
    decision.recommendation,
    decision.why.length > 0 ? `Why: ${decision.why.join(" ")}` : null,
    `Confidence: ${decision.confidence}.`,
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const prompt = buildExplanationPrompt(decision);
    const result = await callGroqWithFallback(prompt);

    if (!result) {
      return { decision, explanation: fallbackExplanation, explanationSource: "fallback" };
    }

    return { decision, explanation: result.reply, explanationSource: "llm" };
  } catch (error) {
    console.error("[DANTE CORE] explainRecommendation failed", error);
    return { decision, explanation: fallbackExplanation, explanationSource: "fallback" };
  }
}
