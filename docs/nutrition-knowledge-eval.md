# Nutrition knowledge retrieval — N1.6.3 evaluation & tuning

> **Status (N1.6.3-R1): READY TO FREEZE = NO.** The sections below up to "Answer quality" record the original
> N1.6.3 pass (v1 set); the current state and blockers are in "N1.6.3-R1" near the end.

Engineering acceptance targets, **not** scientific claims. Corpus: 15 retrievable documents
(~150 chunks), local lexical retrieval only (no embeddings / vector store).

## Method

* `lib/nutrition/knowledge/__tests__/eval/cases.ts` — 49 cases (32 dev / 17 held-out ≈ 65/35), ground
  truth written from the corpus text *before* looking at retrieval output. Held-out phrasing is lexically
  different from dev (dev "Make this meal crunchier." ↔ held-out "I want more bite and crispness.").
* `run-eval.ts` measures the evaluation pyramid separately: Level 1 gate, Level 2 document
  (mandatory Recall@3 over cases where the gate fired), Level 3 section, Level 4 answer usefulness.
  Wrong-document rate = share of the top-3 retrieved chunks whose document is neither mandatory nor on the
  case's acceptable list (a strict definition; several "wrong" hits are arguably relevant).
* **The N1.6.2 baseline was captured before any weight/threshold change** (`BASELINE_CONFIG`, reproducible
  and asserted in `retrieval-eval-n163.test.ts`). Selection used the **dev split only**; the config was
  frozen, then the held-out split was run once. Held-out failures were *not* used to tune anything.
* Score breakdown (`lexicalBody, headingMatch, titleMatch, category, foodType, sensory, cuisine, goal,
  locale, authority, total`) is exposed by `scoreAllForEval` for dev/eval only; it is never in an API
  response or the runtime trace.

## Baseline (N1.6.2 as shipped, original gate, all 49 cases)

| Level | Metric | Value |
|---|---|---|
| Gate | precision / recall | 1.00 / **0.62** (13 of 34 should-retrieve cases missed) |
| Document | mandatory Recall@3 | 0.857 |
| Document | wrong-document rate | 0.172 |
| Section | top-1 / top-3 | **0.375 / 0.50** (8 section cases) |
| Cost | avg / p95 latency | 0.86 ms / 1.87 ms; context avg 1850, max 2611 chars |

Measured defect: for "Make this meal crunchier." the fast-food and fried-chicken chunks tie at 0.704
(saturated `lexicalBody` + the incidental `sensory` match) and **Texture Hacks → Crunch never appears**
(it scored below the top six). Nothing in the score rewarded a chunk *about* crunch over one that merely
mentions it.

## Changes (each justified by dev evidence)

1. **Gate** (dev misses): `heat` as a spicy alias; goal-bearing strategy questions ("I'm bulking, how
   should I…", "…while cutting"); named food + "lighter"; estimate-reliability questions. Dev gate
   recall 0.77 → 1.00, precision stays 1.00.
2. **`headingMatch` (0.20)** — Config A. Dev section top-3 0.67 → 1.00, top-1 0.56 → 0.67; Recall@3 up.
3. **`titleMatch` (0.08)** — Config C. Dev Recall@3 0.929 → 0.964 and wrong-doc 0.190 → 0.172 at MIN 0.30.
4. **Companion-only headings** (`coach-decision-rules`, `common-failure-modes`) no longer rank as
   primaries — the N1.6.1 design intent, which the filter did not enforce. Dev section top-1 0.67 → 0.78.
5. **Not adopted:** Config B (heading + sensory 0.10 → 0.05) changed nothing; a relative score floor
   (0.75–0.90 × best) trades Recall@3 (→ 0.68–0.86) for wrong-doc (→ 0.07–0.10) — rejected because a
   missing key document costs more than an extra bounded chunk the prompt is told to ignore.

## MIN_SCORE sweep (dev, frozen weights)

| MIN_SCORE | Recall@3 | Precision (1 − wrong) | Zero-result | Avg primaries |
|---|---|---|---|---|
| 0.20 | 1.000 | 0.815 | 0.00 | 3.82 |
| 0.25 | 0.964 | 0.815 | 0.00 | 3.77 |
| **0.30 (selected)** | **0.964** | 0.828 | 0.00 | 3.68 |
| 0.35 | 0.929 | 0.839 | 0.00 | 3.36 |
| 0.40 | 0.857 | 0.875 | 0.00 | 2.91 |
| 0.45 | 0.821 | 0.902 | 0.00 | 2.64 |

0.30 is the highest-precision threshold that keeps dev Recall@3 ≥ 0.95. Frozen weights: `lexicalBody .38,
headingMatch .20, titleMatch .08, category .16, foodType .14, sensory .10, cuisine .08, goal .06,
locale .04, authority .04`, `companionOnly`.

## Frozen result

| Metric | Dev | Held-out | All | Target |
|---|---|---|---|---|
| Gate precision | 1.00 | 1.00 | 1.00 | ≥ 0.95 ✅ |
| Gate recall | 1.00 | **0.50** | 0.82 | ≥ 0.90 ❌ held-out |
| Mandatory Recall@3 | 0.964 | **0.875** | 0.944 | ≥ 0.95 ✅ dev / ❌ held-out |
| Wrong-document rate | 0.172 | 0.235 | 0.185 | ≤ ~0.10 ❌ |
| Section top-1 / top-3 | 0.78 / 1.00 | n=1 (miss) | 0.70 / 0.90 | top-3 ≥ 0.90 ✅ (all) |
| Zero-result rate | 0 | 0 | 0 | — |
| Avg / p95 latency | 1.06 / 1.90 ms | 1.01 / 1.75 ms | 1.13 / 1.90 ms | < 5 / < 20 ms ✅ |
| Context avg / max | 1910 / 2488 | 1958 / 2508 | 1920 / 2508 | ≤ 5500 chars ✅ |

**Crunch defect: fixed** (Texture Hacks → Crunch is now in the top 3; dev section top-3 = 1.00).

**What did not generalise (honest):** on held-out phrasing the *gate* recalls only 50% — it is a regex
vocabulary ("more bite and crispness", "tastes flat", "feel awful", "Pho…" are not recognised) — and
Recall@3 / wrong-doc did not improve over baseline (they equal it). The dev gains in sections and
Recall@3 are therefore partly in-sample; the held-out set has only one section case, so section
generalisation is unmeasured. A larger, independently written evaluation set and a bounded semantic gate
(same OpenAI path as the follow-up resolver) are the next steps; neither was in this task's scope.

## Answer quality (Level 4) — live, 15 cases, `answer-quality.live.test.ts`

Same handler/prompt/context; only `knowledgeContext` differs. Hard properties checked deterministically;
subjective 10 × (0–2) dimensions by a **separate blind judge call** (answers shuffled), max 20.
The judge and generator are both `gpt-4o-mini`; treat scores as indicative.

| Metric | Result | Target |
|---|---|---|
| Average Knowledge Lift | **+0.60 / 20** (16.87 → 17.47) | > 0 ✅ |
| Improved answers | **26.7 %** (4 / 15) | ≥ 60 % ❌ |
| Degraded answers | **0 %** | < 10 % ✅ |
| Unsupported numbers / policy leakage / unconfirmed action | 0 / 0 / 0 | 0 ✅ |
| Dairy-allergy suggestions flagged (conservative regex) | without 3 → with 1 | — |

Largest lifts: Coco Pops craving (+4), frozen & creamy (+2), hawker chicken rice while cutting (+2).
Many cases tie (the model is already competent on generic nutrition questions), and one case ("this
cereal bowl" with no draft) is the N1.5 canned reply, so it cannot differ. Knowledge helps most where the
corpus holds opinionated strategy (cravings, hawker, texture), not generic advice.

## N1.6.3-R1 — semantic gate, v2 evaluation set, final status

**READY TO FREEZE N1.6.3 = NO.** R1 added a bounded semantic gate and a larger eval set; the numbers still
miss every retrieval target. Retrieval was not tuned further after the last recording (see "Rejected").

### What R1 added

* **Layered gate**: Layer 1 (regex, `need.ts`) → *uncertain band* → Layer 2 semantic gate
  (`semantic-gate.ts`, one bounded OpenAI call, 4 s timeout, strict JSON). Layer 1 alone had ≈ 0.45 recall on v2.
  The uncertain band catches 43 / 47 Layer-1 positive misses and sends only 4 / 40 negatives to Layer 2.
* **Closed query-enrichment hints** (`semantic-hints.ts`): optional `sensory` ids, `cuisine` ids, `food` ids, in
  addition to `needsKnowledge` and `category`. Contract:
  1. retrieval query-enrichment hints only — not Athlete State, not user preferences, not long-term memory,
     not macro/nutrition truth;
  2. they never select or force a document — they pass through normal retrieval, scoring and filtering;
  3. ids outside the closed lists are rejected; malformed output falls back safely to Layer 1;
  4. no mutation or tool authority.
  They are kept because pure-Vietnamese queries may contain no lexical term the corpus can match.
* **`nutrition-retrieval-eval-v2`** (`cases-v2.ts`): 125 cases = 86 dev + 39 held-out, 42 section cases.
  Gate output is replayed from `semantic-gate-v2.recorded.json`, so the suite is deterministic and offline.
* **Live answer-quality eval rewritten** to 35 cases (opt-in, `NUTRITION_LIVE_EVAL=1`); infrastructure kept.

### Caveats on the evidence

* The v2 held-out split was inspected and re-recorded once with the same semantic-gate prompt. It is **no longer
  perfectly blind** and must not be treated as pristine held-out evidence.
* Gate precision: dev 1.00 / held-out 1.00 / overall 1.00. Gate recall: dev 0.97, held-out 0.92 on the current
  recording, overall 0.95 — but held-out recall varied ≈ 0.84–0.92 across recordings (LLM non-determinism), so
  the 0.92 is a point sample, not a stable figure.
* Section held-out is n = 10; read it as indicative only.

### R1 retrieval results (v2, MIN_SCORE 0.30, relativeFloor 0.5)

| Metric | Dev | Held-out | Overall | Target |
|---|---|---|---|---|
| Mandatory Recall@3 | 0.85 | 0.77 | 0.83 | ≥ 0.95 ❌ |
| Wrong-document rate | 0.20 | 0.32 | 0.24 | ≤ 0.10 ❌ |
| Section Top-3 | 0.52 | 0.70 (n=10) | 0.56 | ≥ 0.90 ❌ |

v1 is preserved (regression-guarded): Recall@3 = 0.944, Section Top-3 = 0.90, Texture Hacks → Crunch still in Top-3.

### Rejected experiments (do not retry blindly)

* `relativeFloor` 0.6 — regressed v1 dev Recall@3 0.964 → 0.893. Kept 0.5.
* Section-only scoring — rejected; experimental code removed.
* Altered repeat-penalty — rejected.
* `MIN_SCORE` stays 0.30. No aliases were added from held-out failures.

### Level 4 (answer quality) — NOT COMPLETED / NO RESULT

The R1 live run was terminated by host memory pressure and produced no valid results. **There is no valid
Knowledge Lift figure for R1**; the +0.60 / 20 above belongs to the older 15-case N1.6.3 run and must not be
carried over. A live batch was deliberately not re-run: with the retrieval metrics above it cannot change the
freeze decision.

### Blockers to freeze

1. Retrieval Recall@3 does not generalise (0.77 held-out vs ≥ 0.95).
2. Wrong-document rate (0.24 overall vs ≤ 0.10).
3. Section retrieval does not generalise (0.56 overall vs ≥ 0.90).
4. No valid live Knowledge Lift result.
5. Held-out v2 is no longer perfectly pristine; a fresh blind split is needed before any freeze claim.

## N1.6.3-R2 — `nutrition-retrieval-eval-v3.1` (blind benchmark, FROZEN 2026-10-10)

Written by an independent evaluator from the corpus text **before** any v3 retrieval output was inspected. v2 is now a
historical regression set; v3.1 is the generalisation benchmark.

**Changelog.** v3.0 (219 rows) was frozen and baselined but never used for tuning. v3.1 appends 48 hypothesis probes
(32 dev / 16 held-out) for the pre-tuning hypotheses A–D, plus 3 option-selection / revert negatives. No v3.0 row was
edited, removed or moved; the test pins the v3.0 hashes over the leading rows to prove it.

* **Size:** 270 cases = 180 dev (repo) + 90 held-out (sealed, outside the repo), 33.3 % held-out. 225 positives,
  45 negatives; 199 positives also carry gold sections. English, Vietnamese and mixed Vietnamese-English; direct,
  indirect, conversational, slang, fragment, messy, follow-up (with an N1.5 `topic`) and paraphrase styles. 14 contrast
  groups, generic-document and section-metadata traps (see `cases-v3-types.ts`).
* **Labels:** `mandatoryDocs` (each required), `anyOfDocs` (one of), `acceptableDocs`, `unacceptableDocs`, `sections`
  (gold; real `parse.ts` heading slugs, any one counts), `siblingSections` (also useful, never counted as a section hit),
  `hypotheses`, `expectedCategory` (informational). Stored fully expanded.
* **Hypothesis probes** (labels describe the corpus, not a fix):
  A_DIVERSITY_KEEP (gold section + genuinely useful sibling; measured by sibling survival and selection suppression),
  A_DIVERSITY_HELP (two documents both required), B_METADATA_BROADCAST (only section-local evidence separates the gold
  sibling), C_LEXICAL_EVIDENCE (terse / indirect / one incidental word / out-of-vocabulary), D_CANONICALISATION (original
  wording matters more than the shared concept: crisp vs crunch, hot weather vs spicy, cocoa bitterness vs chocolate).
* **Oracle gate** (`oracleGate`, eval only): forces every positive to retrieve with its first labelled reason and no
  Layer-2 hints, so retrieval hypotheses can be measured on cases the real gate drops. It is never a gate metric.
* **Frozen:** the dev array and the sealed held-out file are pinned by SHA-256 in `retrieval-eval-v3.test.ts`. A wrong
  label is corrected only by publishing a new version with a written changelog; rows are never edited in place.
* **Hygiene:** token Jaccard < 0.5 against every other v3 message and every v1/v2 message (enforced by the test); probe
  pairs ≥ 0.30 were reviewed by hand and same-structure/one-noun-changed pairs were reworded before freezing.

### Isolation protocol

* **Tuning may use:** `cases-v3-types.ts`, `cases-v3-dev.ts`, `run-eval-v3.ts`, `retrieval-eval-v3.test.ts`,
  `semantic-gate-v3-dev.recorded.json`, `record-gate-v3.live.test.ts`, this document.
* **Held-out:** query text, labels, the held-out Layer-2 recording and held-out metrics live only in the evaluator's
  sealed directory; the suite runs them only when `NUTRITION_EVAL_V3_SEALED` is set. Do not tune on held-out failure
  detail; the evaluator reports held-out as aggregate numbers once tuning is declared finished.
* **Failure classes** (`classifyFailures`) are diagnostics. They must never be turned into aliases or per-case rules.

### R1 baseline on v3.1 DEV (ACTIVE_CONFIG unchanged; layered gate = replayed Layer-2 recording)

| Metric | Layered gate | Layer 1 only | Oracle gate (retrieval only) |
|---|---|---|---|
| Gate precision / recall | 0.973 / 0.743 | 0.963 / 0.351 | n/a |
| Doc Recall@1 / @3 / @4 (gate-fired) | 0.728 / 0.877 / 0.904 | 0.714 / 0.839 / 0.875 | 0.725 / 0.856 / 0.869 |
| End-to-end Recall@3 (gate misses count) | 0.654 | 0.307 | 0.856 |
| MRR | 0.822 | 0.814 | 0.803 |
| Wrong-document rate (top-3 chunks) | 0.327 | 0.322 | 0.324 |
| Distracting (unacceptable) document rate | 0.046 | 0.087 | 0.198 |
| Section Top-1 / Top-3 / wrong-section | 0.448 / 0.552 / 0.420 (n=96) | 0.468 / 0.532 / 0.405 (n=47) | 0.496 / 0.611 / 0.383 (n=131) |
| Sibling survival / suppressed by selection | 0.167 / 0.500 (n=6) | 0.000 / 0.667 (n=3) | 0.400 / 0.400 (n=10) |
| Zero-result rate | 0.018 | 0.000 | 0.061 |
| Avg candidates (≥ MIN_SCORE) / pool after relative floor | 18.7 / 15.2 | 23.3 / 19.6 | 13.5 / 11.5 |
| Avg primary / total chunks | 3.46 / 5.27 | 3.67 / 5.58 | 3.18 / 4.88 |
| Context chars avg / max | 1862 / 2917 | 1901 / 2595 | 1756 / 2941 |
| Retrieval latency avg / p95 (± ~0.2 ms run to run) | 0.69 / 0.93 ms | 0.78 / 1.32 ms | 0.56 / 0.85 ms |

Dev hypothesis subsets, oracle gate (retrieval only):

| Subset | n | Recall@3 | Wrong-doc | Section Top-1 / Top-3 | Sibling survival / suppressed |
|---|---|---|---|---|---|
| A_DIVERSITY_KEEP | 10 | 1.000 | 0.429 | 0.800 / 0.800 | 0.400 / 0.400 |
| A_DIVERSITY_HELP | 4 | 0.875 | 0.083 | 0.500 / 0.750 | — |
| B_METADATA_BROADCAST | 15 | 1.000 | 0.359 | 0.867 / 0.867 | 0.500 / 0.167 |
| C_LEXICAL_EVIDENCE | 11 | 0.818 | 0.520 | 0.700 / 0.700 | — |
| D_CANONICALISATION | 9 | 1.000 | 0.519 | 0.667 / 0.667 | 0.000 / 0.667 |

With the real layered gate, 9 / 15 B probes and 8 / 11 C probes never reach retrieval (gate misses).

Dev failure classes (events, layered): LEXICAL_OVERLAP 47, CATEGORY_CONFUSION 27, METADATA_BROADCAST 21,
QUERY_UNDERSPECIFICATION 21, GENERIC_DOC_DOMINANCE 11, OTHER 10, CUISINE_CONFUSION 8, SENSORY_CONFUSION 4, others ≤ 3.

Observed on dev (not fixed — evaluator does not change the runtime): 5 of 24 dev gate misses are Layer-2 replies
the runtime discards. 3 carry a trailing extra `}` that the greedy JSON match in `parseSemanticGate` cannot parse;
2 carry food ids outside the closed list (rejected by contract).

## N1.6.3-R2 — retrieval relevance (DEV only, 2026-10-10)

Tuned on v3.1 DEV only; held-out never opened. R1 = `R1_CONFIG`, R2 = `ACTIVE_CONFIG` (`lib/nutrition/knowledge/score.ts`).
Oracle = oracle gate (isolates retrieval). v1 = `CASES` all, v2 = `CASES_V2` dev, both Layer-1/recorded gate as in R1.

| Exp | Change | Oracle R@3 | Oracle wrong-doc | Oracle sec T1 / T3 | Oracle sib surv | v1 R@3 / sec T3 | Verdict |
|---|---|---|---|---|---|---|---|
| R1 | reference | 0.856 | 0.324 | 0.496 / 0.611 | 0.400 | 0.944 / 0.900 | — |
| A2 | no category penalty | 0.863 | 0.311 | 0.496 / 0.634 | 0.600 | 0.944 / **0.800** | rejected (v1 sec T3) |
| A3 | doc penalty 0.10 → 0.05 | 0.856 | 0.308 | 0.496 / 0.641 | 0.500 | 0.944 / 0.900 | superseded by A3-0 |
| A3-0 | doc penalty 0 (category 0.08 kept) | 0.850 | 0.279 | 0.496 / 0.656 | 0.500 | 0.944 / 0.900 | **kept** |
| A4 | no penalties at all | 0.856 | 0.252 | 0.496 / 0.672 | 0.700 | **0.917** / **0.700** | rejected (v1) |
| A5 | cap 3, penalties as R1 | 0.856 | 0.314 | 0.496 / 0.611 | 0.400 | 0.944 / 0.900 | no effect alone |
| A5b | cap 3 + no penalties | 0.856 | 0.179 | 0.496 / 0.695 | 0.600 | **0.889** / 0.700 | rejected (v1 R@3) |
| A6 | waive doc penalty within 0.8–0.9 of top | 0.850 | 0.279 | = A3-0 | 0.500 | = A3-0 | equals A3-0, dropped |
| B1–B6 | sensory / lexicalBody over section-local terms only | 0.837–0.856 | 0.316–0.342 | ≈ | 0.4 | **0.833** (lexical-local) | rejected: header terms are what identify the document; cuts candidates (13.5 → 8.5) but loses recall |
| B7 | `localMatch` signal w=0.10–0.20 | 0.837 | 0.347–0.355 | ≈ | 0.5–0.6 | 0.889–0.917 | rejected (v1 R@3) |
| B8 | `localMatch` w=0.04 (tie-break) | 0.856 | 0.331 | 0.504 / 0.618 | 0.400 | 0.944 / 0.900 | **kept** (small) |
| C1 | OOV terms stay in lexical denominator | 0.810 | 0.259 | 0.504 / 0.603 | 0.400 | 0.917 / 0.900 | rejected: zero-result 0.061 → 0.128 |
| C3 | lexicalBody × known/all query terms | 0.843 | 0.294 | 0.511 / 0.618 | 0.400 | 0.917 / 0.900 | rejected: zero-result 0.088, R@3 down |
| C5 | cap lexicalBody ×0.5 / ×0.7 when 1 of ≥2 known terms match | 0.824 / 0.843 | 0.294 / 0.308 | ≈ | 0.5 / 0.6 | 0.917 / **0.800** (×0.5) | rejected |
| D1 | Unicode tokenization (`\p{L}`) | = R1 | = R1 | = R1 | = R1 | = R1 | **kept**: correctness (Vietnamese words no longer shatter into `ch gi mu`), metric-neutral |
| D2 | `-ness` / `-iness` stem ("Crispness" → crisp, "Creaminess" → creamy) | 0.850 | 0.324 | 0.504 / 0.626 | 0.400 | 0.944 / 0.900 | **kept** (D-subset sec T3 0.667 → 0.778) |
| D3 | weather "hot" ≠ spicy | 0.843 | 0.323 | ≈ | 0.4 | = | **rejected**: `detectConcepts` also feeds the Layer-1 gate, so `d3-p27` flips to Layer-1-uncertain and needs a new live Layer-2 recording (gate change, out of R2 scope). Open item. |
| E | document candidate stage: drop documents whose best section < 0.7/0.8/0.9 × overall best | 0.830 / 0.817 / 0.797 | 0.264 / 0.221 / 0.125 | ≈ | 0.7 | **0.861 / 0.778 / 0.694** | rejected: the wrong-doc gain is bought with recall; secondary documents of multi-document asks sit well below the best |
| **R2** | A3-0 + cap 3 + B8 + D1 + D2 | **0.850** | **0.259** | **0.511 / 0.695** | 0.500 | **0.944 / 1.000** | **retained** |

Floor re-check on R2 (0.50 / 0.55 / 0.60): v1 R@3 0.944 / 0.917 / 0.889 with no wrong-doc benefit worth it, so `relativeFloor` stays 0.5.

### R2 final DEV (layered gate; gate unchanged: P 0.973, R 0.743)

R@1 0.719 · R@3 0.877 · R@4 0.895 · MRR 0.812 · wrong-doc 0.248 (R1 0.327) · section T1 0.469 / T3 0.656 (R1 0.448 / 0.552) ·
wrong-section 0.395 · sibling survival 0.333 (R1 0.167) · zero-result 0.018 · candidates 19.4 · pool 14.7 · context avg/max 1925 / 2929 ·
latency avg/p95 0.89 / 1.51 ms. `genericAboveSpecific` rose 0.045 → 0.064 (cap 3 lets a third section of a generic doc in).

Oracle gate: R@1 0.712 · R@3 0.850 · R@4 0.863 · MRR 0.791 · wrong-doc 0.259 · section T1 0.511 / T3 0.695 · wrong-section 0.354 · sib survival 0.500 · zero-result 0.061.

Targets (R@3 ≥ 0.95, wrong-doc ≤ 0.10, section T3 ≥ 0.90) are **not** reached. The residual failures are not tuning: (1) queries with no
vocabulary overlap (luscious, kick, squeeze, KFC/Maccas, all Vietnamese) retrieve nothing without a Layer-2 hint; (2) boilerplate sections
(`core-goal`, `identify-what-the-user-actually-wants`, `add-protein-and-volume…`) repeat across documents and tie on header evidence;
(3) goal-strategy asks (17 cases, section T3 0.27) have no signal beyond category/goal. Next step needs query understanding, not weights.

Reproduce: `NUTRITION_R2_PRINT=1 [NUTRITION_R2_HYP=1] npx vitest run lib/nutrition/knowledge/__tests__/eval/sweep-r2.print.test.ts`,
`NUTRITION_R2_DOM=1 …` (per domain), `NUTRITION_R2_DBG=1 … dbg-r2.print.test.ts` (per-case signal dump). Rejected B/C/E knobs were removed from the runtime after measurement.

## Reproduce

```
npx vitest run lib/nutrition/knowledge                      # regression guard (baseline + frozen floors)
NUTRITION_EVAL_V3_PRINT=1 npx vitest run lib/nutrition/knowledge/__tests__/eval/retrieval-eval-v3.test.ts   # v3 dev report + failure events
NUTRITION_EVAL_PRINT=1 npx vitest run lib/nutrition/knowledge/__tests__/eval   # printed reports + sweep
NUTRITION_LIVE_EVAL=1 npx vitest run lib/nutrition/knowledge/__tests__/eval/answer-quality.live.test.ts   # live OpenAI
```
