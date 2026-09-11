/**
 * Static Evidence Registry (spec §48).
 *
 * Dante already performs LIVE PubMed/Europe PMC search for
 * open-ended questions (see app/api/chatbot/route.ts). This registry
 * is deliberately small and separate: it holds only the specific,
 * verified references the deterministic Training Intelligence engine
 * itself cites in recommendation explanations, so those citations
 * never depend on a live network call succeeding.
 *
 * Never fabricate an entry here. Every reference must be a real,
 * checkable publication.
 */

export type ResearchEvidence = {
  id: string;
  title: string;
  authors: string;
  journal: string;
  year: number;
  pmid?: string;
  doi?: string;
  topics: string[];
  conciseSummary: string;
  implementationImplications: string[];
  limitations: string[];
  evidenceVersion: number;
};

export const PELLAND_2025_VOLUME_DOSE_RESPONSE: ResearchEvidence = {
  id: "pelland-2025-volume-dose-response",
  title:
    "The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains",
  authors: "Pelland JC, et al.",
  journal: "Sports Medicine",
  year: 2025,
  pmid: "41343037",
  doi: "10.1007/s40279-025-02344-w",
  topics: ["training-volume", "hypertrophy", "strength", "training-frequency"],
  conciseSummary:
    "Weekly resistance-training volume shows a dose-response relationship with hypertrophy and strength gains, but with diminishing returns — additional volume does not produce proportional additional growth, and individual response varies.",
  implementationImplications: [
    "Model training exposure (effective sets) rather than predicted growth.",
    "Treat additional volume as having diminishing, not linear, marginal value.",
    "Do not treat training frequency as a simple hypertrophy multiplier.",
    "Avoid presenting any fixed set number as universally optimal.",
  ],
  limitations: [
    "A meta-regression across studies and populations — not a measurement of any individual user.",
    "Does not establish an exact optimal volume for any specific person.",
  ],
  evidenceVersion: 1,
};

export const EVIDENCE_REGISTRY: ResearchEvidence[] = [
  PELLAND_2025_VOLUME_DOSE_RESPONSE,
];

export function getEvidenceById(id: string): ResearchEvidence | null {
  return EVIDENCE_REGISTRY.find((entry) => entry.id === id) ?? null;
}
