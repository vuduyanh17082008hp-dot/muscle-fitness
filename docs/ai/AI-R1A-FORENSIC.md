# AI-R1A Forensic Findings (recorded)

Status: RECORDED SUMMARY. This file records the finalized R1A findings as they were carried
into R1B (via the R1B brief) and summarized in [AI-R1-ARCHITECTURE.md](./AI-R1-ARCHITECTURE.md).
No new forensic facts are introduced here.

## Evidence-quality caveat

The original R1A line references came partly from read-only subagent reports and were **not all
independently re-verified** against the source. Treat file/line pointers as leads to re-check
before acting on them. The original standalone R1A report was never committed; this file is its
repo-resident stand-in.

## Findings

- Most AI-R1 concepts already exist in Dante / Gemma. Rule: REUSE > ADAPT > EXTEND > CREATE.
- `lib/ai/` serves a different (business-AI) role → not used for the shared core.
- Canonical home for the shared layer: `lib/intelligence/` (no prior equivalent).
- Existing-system reuse (mapped, not replaced): `DanteEvidenceKind`, `ProvenanceKind`,
  `DanteConfidence` / confidence-engine, Gemma `DataSource` / `DraftStatus`, retrieval metadata;
  runtime gates (`DanteEpistemicCapsule`, claim-gate, output-claim-validator, `MacroResultBinding`,
  `hasUngroundedMacros`) stay untouched.

## Backlog items (tracked, not fixed in R1B)

- AI-R1-SEC-01 — client-supplied `per100g` trusted by some mutation paths.
- AI-R1-SEC-02 — nutrition mutation routes lack rate limiting.
- AI-R1-PROVIDER-01 — OpenAI model config inconsistency.
- AI-R1-DOC-01 — N1.6.3 freeze documentation mismatch.
