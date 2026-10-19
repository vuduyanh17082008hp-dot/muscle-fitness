# nutrition-retrieval-eval-v4 (N1.6.3-R3)

Question this benchmark answers:

> Does R3 improve query understanding and retrieval generalisation on unseen natural-language nutrition questions
> without degrading precision, safety boundaries, document breadth, or section relevance?

v4 is a fresh benchmark written for R3. **v3.1 is no longer blind** (its held-out was used for the R2 review) and is
now a historical regression set only — keep it green, do not tune against it as if it were unseen.

## Splits

| Split | Where | Who |
|---|---|---|
| DEV (254 rows) | `lib/nutrition/knowledge/__tests__/eval/cases-v4-dev.ts` | Implementation may read and tune on it. Frozen by SHA-256. |
| HELD-OUT (~1/3 of v4) | Sealed, outside the repo | Evaluator only. Never in the repo, never in an implementation prompt. |

DEV is frozen (`a1bdad47…`, pinned in `retrieval-eval-v4.test.ts`). A wrong DEV label is fixed only by publishing a new,
changelogged version — never by editing rows in place. Held-out results are reported by the evaluator after R3 is done.

## Files

- `cases-v4-types.ts` — schema + `pos` / `neg` builders (no labels).
- `cases-v4-dev.ts` — DEV rows.
- `run-eval-v4.ts` — split-agnostic runner, metrics, dataset checks, adversarial diagnostics, `V4_TARGETS`.
- `retrieval-eval-v4.test.ts` — DEV integrity, shape, near-duplicate and leakage checks, hash pin, R2 non-regression floors.
- `record-gate-v4.dev.live.test.ts` + `semantic-gate-v4-dev.recorded.json` — Layer-2 replies for Layer-1-uncertain DEV rows.

```
npx vitest run lib/nutrition/knowledge                                  # offline, deterministic
NUTRITION_EVAL_V4_PRINT=1 npx vitest run lib/nutrition/knowledge/__tests__/eval/retrieval-eval-v4.test.ts   # print DEV report
NUTRITION_LIVE_EVAL=1 npx vitest run lib/nutrition/knowledge/__tests__/eval/record-gate-v4.dev.live.test.ts # re-record (classifier calls only)
```

A recording is keyed by message and by a hash of the semantic-gate prompt; changing the prompt invalidates it (the case
falls back to Layer 1 and the "every uncertain case has a recording" test fails) — re-record DEV after a prompt change.

## Pipeline under test

Same as the open-ended chat path (`lib/nutrition/coach/chat.ts`): `decideNutritionKnowledgeNeed({ message })` (no N1.5
intent — v4 rows are free text) → Layer-2 replay when Layer 1 is uncertain → `buildKnowledgeQuery({ message, reason, topic,
goal: athleteGoal, timezone: "Asia/Singapore", hints })` → `retrieveKnowledge(ACTIVE_CONFIG)`.

Three gates are reported: **layered** (the real one; targets apply to it), **layer1-only**, and **oracle** (eval-only:
every positive fires with its first labelled reason and no hints — isolates retrieval from the gate).

## Schema (`V4Case`)

| Field | Meaning |
|---|---|
| `expectedKnowledgeNeed` | Should the gate fire. |
| `expectedReasons` | Correct gate readings (first = primary; the oracle uses it). |
| `expectedDocumentIds` / `anyOfDocumentIds` | Requirement units: each expected doc is one unit; the anyOf group is one unit. With neither given, the target section's doc is required. |
| `acceptableDocumentIds` | Fine in the top 3 (generic docs `core.basics`, `coaching.*` are acceptable unless required/unacceptable). Anything else in the top 3 is a wrong doc. |
| `unacceptableDocumentIds` | Explicit distractors. |
| `sectionEvaluation` | `false` = document-only case; section metrics skip it. |
| `expectedSectionIds` / `acceptableSectionIds` | A hit is the first primary chunk in expected ∪ acceptable. |
| `alsoUsefulSectionIds` | Not a hit; used only for sibling survival / suppression. |
| `requiredConcepts` / `forbiddenConcepts` | Observable query facets (`sensory:`, `cuisine:`, `food:`, `goal:`) the built query must / must not carry. |
| `multiDocument`, `siblingSensitive`, `contrastGroup`, `failureClass`, `language`, `domain`, `difficulty`, `topic`, `athleteGoal` | Slicing and context. |

Failure classes: `INDIRECT_INTENT`, `LOW_OVERLAP`, `VIETNAMESE`, `MIXED_LANGUAGE`, `GOAL_STRATEGY`, `POLYSEMY`,
`CUISINE_CONTEXT`, `CRAVING_SENSORY`, `MULTI_DOCUMENT`, `SIBLING_SECTION`, `FOLLOW_UP`, `NEGATIVE_NEAR_MISS`.

There are no Japanese / Korean / café / Indian cuisine documents. Those rows label goal / uncertainty sections and mark
`cuisine.vietnamese` / `cuisine.singapore_hawker` unacceptable (`NO_CUISINE_DOC`).

## Metrics

- **Gate:** P / R / FP / FN. Misses are classed `follow-up` > `language` (vi / mixed) > `polysemy` > `semantic`; false positives on near-miss negatives are counted separately.
- **Documents (fired positives):** R@1/3/4 over requirement units, MRR, wrong-doc rate (top-3 chunks outside required ∪ acceptable), distracted-case rate, generic-above-specific. **End-to-end R@3** counts gate misses as failures.
- **Coverage@4 (multi-document):** mean share of requirement units in the top-4 chunks, the full-coverage rate, and end-to-end coverage. Tracked with no threshold.
- **Sections:** T1 / T3, end-to-end T3, and wrong-section rate (target doc retrieved but its best chunk is not a hit). Sibling-sensitive T1 / T3. Sibling survival (target hit and an also-useful sibling selected) and suppression (the sibling outscored a selected other-doc chunk but was dropped).
- **Query understanding (observable outputs only):**
  - intent accuracy (any / primary reason);
  - concept coverage (all `requiredConcepts` in the query);
  - language normalisation (concept coverage on vi / mixed);
  - polysemy resolution (no `forbiddenConcepts` leaked);
  - hint usefulness (R@3 / T3 with vs without Layer-2 hints, same reason).
- **Ops:** zero-result rate, candidates, pool after floor, primary / total chunks, context chars, latency.
- **Slices:** every metric by failure class, domain, language and difficulty.

## DEV composition

| Field | Value |
|---|---|
| Rows | 254 |
| Positives | 213 |
| Negatives | 41 (16.1%), 30 of them near-misses |
| Language | en 74.8% / vi 15.0% / mixed 10.2% |
| Difficulty | easy 20.5% / medium 48.8% / hard 30.7% |
| Section-evaluable positives | 97% |
| Multi-document | 12 |
| Sibling-sensitive | 54 |
| Also-useful siblings | 22 |
| Concept-labelled | 47 |
| Polysemy-forbidden | 5 |
| Follow-ups | 6 |
| Contrast groups | 23 (each ≥ 2 rows) |

Vietnamese includes accented, unaccented, shorthand (`ko`, `dc`, `j`, `k`) and slang.

Negatives cover:

- logging;
- arithmetic and macro lookups;
- preference statements;
- follow-up draft edits;
- corrections;
- plan selection;
- confirmations;
- state-only questions.

## R2 baseline on DEV (ACTIVE_CONFIG unchanged, 2026-10-10)

| Gate | P | R | R@1 | R@3 | e2e R@3 | MRR | wrong-doc | Cov@4 | sec T1 | sec T3 | e2e T3 | wrong-sec | zero |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| layered | 0.976 | 0.761 | 0.613 | 0.780 | 0.600 | 0.729 | 0.312 | 0.682 | 0.430 | 0.595 | 0.454 | 0.383 | 0.080 |
| layer1-only | 0.953 | 0.286 | 0.652 | 0.783 | 0.240 | 0.784 | 0.328 | 0.688 | 0.450 | 0.633 | 0.184 | 0.347 | 0.000 |
| oracle | — | 1.000 | 0.538 | 0.707 | 0.707 | 0.642 | 0.361 | 0.583 | 0.386 | 0.507 | 0.507 | 0.408 | 0.164 |

Layered gate:

- 51 misses: semantic 37, language 7, polysemy 4, follow-up 3.
- 4 false positives, all near-misses.

Layered understanding:

- Intent accuracy is 0.858 (primary reason 0.611).
- Concept coverage is 0.902 on fired rows; under the oracle it is 0.553 on all labelled rows.
- Language normalisation is 0.885 on fired rows (oracle 0.379).
- Polysemy resolution is 0.75.
- Hints: R@3 is 0.918 with hints vs 0.590 without; T3 is 0.733 vs 0.467.

Sibling metrics (layered):

- Sibling-sensitive T1 / T3: 0.537 / 0.707.
- Survival: 0.25.
- Suppression: 0.19.

Ops (layered):

| Metric | Value |
|---|---|
| Average candidates | 16.9 |
| Average pool after floor | 13.6 |
| Average primary chunks | 3.44 |
| Average context chars | 1767 |
| Max context chars | 2597 |
| Latency avg / p95 | 0.78 / 1.06 ms |

Weakest slices under the oracle gate (R@3 / T3):

| Slice | R@3 | T3 |
|---|---|---|
| Vietnamese | 0.03 | 0.03 (zero-result 0.94) |
| Goal strategy | 0.64 | 0.36 |
| Low overlap | 0.68 | 0.42 |
| Mixed | 0.68 | 0.45 |
| Indirect intent | 0.69 | 0.54 |
| Craving / sensory | 0.69 | 0.57 |
| Multi-document | 0.58 (Cov@4 0.58) | — |

The layered numbers on Vietnamese look better only because Layer-2 hints carry the concepts. The Vietnamese words
themselves are not understood by the deterministic query builder.

`retrieval-eval-v4.test.ts` pins these minus slack as **non-regression floors**. They are floors, not targets.

## Public R3 targets (layered gate, `V4_TARGETS`)

| Metric | Target |
|---|---|
| Gate precision | ≥ 0.95 |
| Gate recall | ≥ 0.90 |
| Doc R@3 | ≥ 0.95 |
| Wrong-doc rate | ≤ 0.10 |
| Section T3 | ≥ 0.90 |
| Coverage@4 | tracked, no threshold |

The targets are not lowered for v4. Held-out is evaluated against the same targets by the evaluator.

## Benchmark-strength checks (DEV)

These checks are enforced by the test:

- No row quotes a required document title.
- ≤ 10% of rows quote a target heading (4 rows quote the single word "crunch").
- Token Jaccard < 0.5 within v4 and against v1 / v2 / v3-dev.
- Every contrast group has at least two rows.
- Every failure class has at least five rows.

A naive title / heading matcher reaches only DEV R@3 0.28, so the benchmark cannot be passed by matching document
titles. Concept labels deliberately include Vietnamese words the current normaliser does not know (e.g. giòn, kem,
cay, tăng cơ). A fix that only aliases DEV vocabulary is expected not to generalise: the held-out split was written with
different Vietnamese and English vocabulary for the same intents.

## N1.6.3-R3 — DEV implementation (2026-10-10) — DEV CANDIDATE, NOT A PASS

Scope: DEV only. The sealed held-out split was never read, searched for, or evaluated. Only the evaluator's sealed v4 run can say whether any of
this generalises. R3 is **not frozen**. All numbers below are the frozen v4 DEV split with the Layer-2 replies recorded for the final prompt
(`semantic-gate-v4-dev.recorded.json`). Layer 2 is not deterministic: successive re-recordings of the same prompt moved Section Top-3 between
0.66 and 0.72 and gate recall between 0.88 and 0.97, so treat differences of a few points as noise.

### Failure map (what was found before any scoring code changed)

| Layer | Information that exists | Lost | Duplicated | Over-weighted |
|---|---|---|---|---|
| Query → Layer-1 gate | words, a few regexes | everything outside an English cue list; `how much`, `cheap`, `exact` act as lookup proxies even for judgment questions; no cue for provenance talk or unaccented Vietnamese | — | `NOT_UNCERTAIN` (a cost router) behaved like a decision |
| Layer-2 gate | closed category + sensory / cuisine / food | strategy and principle topics, the goal the message states; `general_nutrition` had no category | — | strict parse: a stray `}` or one out-of-vocabulary facet (`"sharp"`, `"tofu"`) discarded the whole reply (about 10 of 125 DEV replies) |
| Query representation | raw tokens, 15 concept ids | the meaning of a non-English sentence (every Vietnamese token is out of vocabulary) | concept ids duplicated as tokens | one incidental known token (`cut`, `actually`) gets a near-full lexical share in a ~120-chunk corpus |
| Document score | category prior, metadata signals | — | title / category / metadata header broadcast into every chunk's lexical text | the category prior (one reason picks the categories) |
| Section score | heading + body (`localTerms`) | local evidence weighed only 0.04–0.2 | — | boilerplate ("Core goal", "Identify what the user actually wants") wins on header ties |
| Selection | per-category diversity, cap 3 per document | — | — | fills slots with other-document filler (wrong-document) |

### Experiments (DEV; "R2" = `R2_CONFIG` on the same gate and recordings)

| Stage | Change | Result | Verdict |
|---|---|---|---|
| R3-A1 | Layer-2 parse: first balanced `{…}`, facets reduced to closed vocabularies | gate recall 0.761 → 0.808, precision 0.977; no re-recording needed | **kept** |
| R3-A2 | Layer-1 band: provenance talk, ask / choose shape (≥ 5 words), unaccented-Vietnamese function words, nutrition-topic lexicon; `how much` / `cheap` are a lookup only without a judgment word; assistant small talk stays out | gate recall 0.808 → 0.920, precision 0.980; Layer-2 share of DEV messages 49% → 62% | **kept** (cost noted) |
| R3-A3 | preference / goal statements, `mark … done`, `X is disgusting`, `protein content of`, `which … has more` stay deterministic NO | removed 3 near-miss false positives; no recall loss | **kept** |
| R3-B | one Layer-2 call also returns `topics` (24 corpus-derived ids), the stated `goal`, and a `general_nutrition` category; the prompt states what the library covers and gives 6 intent-level examples | gate precision 0.99+, recall 0.96; hinted R@3 with / without hints 0.91 / 0.55 | **kept** |
| R3-B | `concept` signal: topic terms matched against the section's OWN heading + body, weight 0.25 | R@3 +9 pts, Section T3 +8 pts vs concept weight 0 | **kept** |
| R3-B | per-topic max / mix instead of the pooled concept share | R@3 −1 … −2 pts, T3 ±0 | rejected |
| R3-C | `lexicalScope: "local"`: lexicalBody over heading + body + title, not the metadata header | oracle Section T3 0.507 → 0.527, wrong-section −1.6 pts; layered ≈ | **kept** (small) |
| R3-C | ×0.5 / ×0.7 for a chunk with no section-local evidence | R@3 −0.5 … −1 pt, no wrong-document gain | rejected |
| R3-C | `goalMismatchFactor 0.7` for a goal the MESSAGE states | R@3 +0.5, wrong-document −0.6 pt | **kept** (small) |
| R3-D | stricter floor for non-leading documents (0.6 / 0.7 / 0.8 / 0.9) | wrong-document 0.33 → 0.31 / 0.30 / 0.26 / 0.22, but R@3 −1 / −3 / −7 / −10 pts and Coverage@4 −0.04 … −0.18 | rejected (same trade as R2-E) |
| R3-D | reserve slot 3 for a close second document (0.6 / 0.75 / 0.9) | no effect: a close rival does not survive the relative floor | rejected, code removed |
| R3-D | `maxPerDocument` 2 / 4 | 2: wrong-document +3 pts; 4: no change | R2 value (3) kept |
| R3-E | ×0.35 … 0.7 on raw lexical evidence when Layer 2 gave concepts | R@3 −2 … −10 pts | rejected |
| R3-E | count-based known-token confidence `min(1, known / n)`, n = 2 / 3 / 4 | n = 4: oracle wrong-document −3.9 pts, but layered R@3 −1.4 and T1 −3.5 pts; n = 2 ≈ no effect | rejected (noise-level trade) |
| R3-E | repeat-category penalty 0.08 → 0.04 / 0 | wrong-document −2.8 / −5 pts, R@3 −1 / −2.5 pts | not adopted (R2 saw v1 Section T3 fall); open item |
| R3-E | standard English filler words are not evidence (`actually`, `look`, `even`, `still` …; domain words `cut`, `full`, `keep`, `stop`, `enough` kept) | layered R@3 +1.4 pts, oracle R@3 +0.5 | **kept** (general, not DEV vocabulary) |

### R2 → R3 on DEV, layered gate

| Metric | R2 (as frozen) | R3 candidate | R2 scoring on the R3 gate |
|---|---|---|---|
| Gate precision | 0.976 | **0.995** (1 FP) | 0.995 |
| Gate recall | 0.761 | **0.967** (7 FN) | 0.967 |
| R@1 / R@3 / R@4 | 0.613 / 0.780 / 0.786 | 0.687 / **0.862** / 0.866 | 0.604 / 0.765 / 0.770 |
| End-to-end R@3 | 0.600 | **0.831** | 0.738 |
| MRR | 0.729 | 0.795 | 0.703 |
| Wrong-document | 0.312 | 0.322 | 0.356 |
| Section T1 / T3 | 0.430 / 0.595 | 0.445 / **0.660** | 0.390 / 0.565 |
| End-to-end Section T3 | 0.454 | 0.638 | 0.546 |
| Wrong-section | 0.383 | 0.403 | 0.405 |
| Sibling survival | 0.25 | 0.21 | — |
| Coverage@4 (12 multi-document rows) | 0.682 | **0.727** | 0.727 |
| Zero-result | 0.080 | 0.010 | 0.097 |
| Context avg / max chars | 1767 / 2597 | 1942 / 2811 | — |
| Retrieval latency avg / p95 | 0.78 / 1.06 ms | 0.82 / 1.28 ms | — |

Oracle gate (retrieval isolated): R@3 0.707 → 0.707, wrong-document 0.361 → 0.367, Section T3 0.507 → 0.531. **The retrieval-side change is small; the
gain is the structured Layer-2 intent.** With Layer 1 alone, end-to-end R@3 is 0.25.

Slices (layered, R@3 / Section T3; R2 in brackets): Vietnamese 0.788 / 0.742 (0.571 / 0.538); mixed 0.909 / 0.650 (0.800 / 0.474); goal strategy
0.886 / 0.659 (0.625 / 0.345); polysemy 0.967 / 0.667 (0.885 / 0.500); low overlap 0.781 / 0.448 (0.731 / 0.478). Query understanding: concept coverage
0.935, language normalisation 0.931, polysemy resolution 0.80 (R2 0.902 / 0.885 / 0.75).
Layer-2 utilisation: 62% of DEV messages are routed (R2 49%); 32% of the DEV negatives are routed and Layer 2 turns all but one back to NO.

### Public targets (DEV, layered): not met

| Target | R3 DEV | |
|---|---|---|
| Gate precision ≥ 0.95 | 0.995 | met |
| Gate recall ≥ 0.90 | 0.967 | met on DEV. The Layer-2 prompt examples were refined while reading DEV misses, so expect the held-out figure to be lower |
| Recall@3 ≥ 0.95 | 0.862 (end-to-end 0.831) | **not met** |
| Wrong-document ≤ 0.10 | 0.322 | **not met** |
| Section Top-3 ≥ 0.90 | 0.660 | **not met** |

### Historical regression (R3 scoring; Layer-2 re-recorded with the R3 prompt because the prompt hash changed)

| Suite | R2 | R3 |
|---|---|---|
| v1 (frozen N1.6.2 set, all 49 cases) R@3 / Section T3 | 0.944 / 1.000 (R2 table, earlier Layer-2 recording) | 0.930 / 1.000 (dev 0.964, held-out 0.867). R2 scoring on the SAME new recording gives the identical 3 misses (d-18, h-3, h-10): the dip is Layer-2 re-recording variance, not R3 scoring |
| v2 layered | overall R@3 ≈ 0.82, wrong-document ≈ 0.23, Section T3 ≈ 0.60 (test floors) | dev R@3 0.900, wrong-document 0.149, Section T3 0.710; held-out R@3 0.783, wrong-document 0.308, Section T3 0.727 |
| v3.1 DEV layered | P 0.973, R 0.743, R@3 0.877, wrong-document 0.248, Section T3 0.656 | P 0.978, R 0.905, R@3 0.892, wrong-document 0.241, Section T3 0.748 (3 FPs: two pre-existing Layer-1 YES, one Vietnamese "how much protein per meal" that Layer 2 reads as strategy) |

The v3.1 held-out was not re-run: it lives outside the repository and was already used for the R2 review.

### Residual failures: why the targets are not reachable by this approach alone

1. **Incidental known token vs. unknown meaning.** "đang cut mà tối nào cũng đói" has one known token (`cut`); every chunk containing it gets a full lexical
   share and outranks the section that only the concept supports. Damping lexical evidence traded away more recall than it saved (rows above).
2. **Sibling discrimination needs section-purpose understanding the closed topic list only approximates** (calorie drivers vs substitutions vs keep-identity).
   Section Top-3 0.66 against 0.90 and sibling survival 0.21 are the largest gaps.
3. **Layer-2 mistakes are copied into retrieval.** A wrong `food` / `cuisine` tag (`fried_chicken` for plain chicken breast, `vietnamese` for pad thai) is a hard
   boost for the wrong document. The prompt now says what is out of vocabulary; that is a prompt fix, not a guarantee.
4. **Wrong-document is structural.** The top-3 chunks include category-diversity filler by design; the knobs that reduce it (floors, diversity) cost recall and coverage.
5. Embeddings were **not** added. The DEV evidence (1, 2) points at a semantic reranker as the likely next lever, but it was not tried; report separately before building it.

### Boundaries

The retrieval intent is closed-vocabulary retrieval hints only. It cannot reach user state, preferences, memory, allergies, logging, selection, tool execution
or medical facts; `hints` are consumed only by `buildKnowledgeQuery`. No change to allergy / exclusion enforcement, N1.5 conversation routing, draft handling
or action confirmation (the `app/api/chatbot` and `lib/nutrition/coach` suites pass). Layer-1 `NO` for logging / edits / lookups / state is unchanged or stricter.

## R3-F — hierarchical document → section retrieval (DEV only, 2026-10-10)

Sealed v4 was not accessed. Gate, Layer-1 band, semantic-intent schema, corpus, benchmark, aliases, safety and confirmation logic are unchanged
(gate P/R identical in every run: 0.995 / 0.967 on v4 DEV). Embeddings and a vector DB were not added. **The runtime stays on R3** (`ACTIVE_CONFIG`);
the candidate is `R3F_CONFIG`, opt-in through `ScoreConfig.hier` (`lib/nutrition/knowledge/hierarchical.ts`).

**Design.** `rankHierarchical` scores documents and sections as separate observable objects. `DocumentCandidate.documentScore` = category, food type, cuisine,
sensory metadata, goal, locale, authority, title, plus the document's *best single section's* evidence and concept (a max, never a per-sibling copy).
`SectionCandidate.sectionScore` = the section's own heading/body evidence ("local") or the flat R3 chunk score ("legacy"). Final order =
`docShare × (documentScore / best) + (1 − docShare) × sectionScore`, so within one document the order is decided by `sectionScore` alone.

### Diagnosis (R3 flat, v4 DEV)

- 195 of 605 top-3 slots are wrong-document; **128 of them are filler after the right document was already retrieved** (ranks 2–3); 48 are cases where the
  required document is missing entirely.
- Document **#0 is wrong in 20% of fired positives** (41/206). That alone floors wrong-document near 0.17–0.20 under perfect allocation.
- The margin `score₁/score₀` is calibrated: doc #0 is correct 94% (<0.6), 90% (0.6–0.75), 79% (0.75–0.9), 69% (>0.9) — which is why dominance-gated allocation was tried.
- Within a correct document, section Top-1 / Top-3 is **0.56 / 0.845** for the flat score, 0.555 / 0.845 for local scoring, 0.515 / 0.815 for BM25 and
  0.495 / 0.805 for BM25+concept. A coordinate search over the four local weights reached only 0.58 / 0.845. Failures are exact score ties broken by chunk id,
  a Layer-2 topic word matching a heading, and targets with zero lexical evidence ("ordering-strategy" for a drive-thru question).
- A coordinate search over all 12 document-score weights moved document R@1 0.694 → 0.721 and R@3 0.871 → 0.883. Not adopted (DEV-fit, ~5 cases).

### Experiments (v4 DEV, layered gate, recorded Layer-2; oracle gate in brackets)

| | R@1 | R@3 | e2e R@3 | MRR | wrong-doc | Sec T1 | Sec T3 | wrong-sec | sibling surv. | Cov@4 | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R3 flat | 0.687 | 0.862 | 0.831 | 0.795 | 0.322 (0.367) | 0.445 | 0.660 (0.531) | 0.403 | 0.211 | 0.727 | baseline |
| F1 explicit doc rank, top-3 docs, flat sections | 0.687 | 0.853 | 0.822 | 0.794 | 0.296 | 0.440 | 0.690 | 0.406 | 0.211 | 0.682 | partly kept (see F5) |
| F2 doc rank + local-only sections | 0.682 | 0.848 | 0.818 | 0.794 | 0.306 | 0.415 | 0.650 | 0.425 | 0.316 | 0.636 | rejected: Top-3 not better |
| F3 adaptive candidate set (≤4 docs, ≥0.5× best) | 0.682 | 0.848 | 0.818 | 0.794 | 0.305 | 0.415 | 0.655 | 0.417 | 0.316 | 0.636 | rejected: v1 R@3 0.884 → 0.837 |
| F4 dominance-gated slot allocation | 0.691 | 0.756 | 0.729 | 0.762 | 0.220 | 0.410 | 0.640 | 0.440 | 0.316 | 0.455 | rejected: R@3 −0.106 |
| **F5 flat sections + doc score (docShare 0.5), no cutoff** | 0.687 | 0.853 | 0.822 | 0.798 | **0.272 (0.310)** | 0.435 | **0.685 (0.551)** | 0.415 | **0.316** | 0.636 | **candidate, not active** |

Other rejected probes: dropping the leading document's weaker siblings (`sibRatio` ≥ 0.6) made wrong-document *worse* (0.31–0.42); a final-score floor
(0.6–0.9) lost recall faster than wrong-document (floor 0.8: R@3 0.783 for wrong 0.247); reserving the best section of the top-2 documents did not recover v1;
`docShare` 1.0 destroys section order (Top-3 0.45); an `-ing`/`-ed` suffix stem moved flat Section Top-3 +0.025 but Recall@3 −0.009 and changes every frozen suite (reverted).

### F5 candidate, all metrics (v4 DEV, layered)

Gate P 0.995 / R 0.967 (unchanged). R@1 0.687, R@3 0.853, R@4 0.857, e2e R@3 0.822, MRR 0.798, wrong-doc 0.272, Section T1 0.435 / T3 0.685, wrong-section 0.415,
sibling survival 0.316 (sibling-sensitive Top-3 0.725 vs 0.706), Coverage@4 0.636 (−1 requirement unit of 11; full coverage 2 cases fewer), document-ranking-only R@1 / R@3 / MRR
0.694 / 0.871 / 0.808 (flat 0.699 / 0.854 / 0.798). Slices R@3 / Section T3 (R3 in brackets): Vietnamese 0.818 / 0.774 (0.788 / 0.742); mixed 0.909 / 0.700 (0.909 / 0.650);
goal strategy 0.909 / 0.707 (0.886 / 0.659); polysemy 0.933 / 0.667 (0.967 / 0.667); low-overlap 0.781 / 0.483 (0.781 / 0.448). Context avg / max 1991 / 2925 chars;
latency avg / p95 1.04 / 1.62 ms; zero-result 0.000 (R3 0.010).

### Regression (same recorded Layer-2 replies; R3 → R3-F)

| Suite | Recall@3 | wrong-document | Section Top-3 |
|---|---|---|---|
| v1 (49) | 0.930 → **0.884** | 0.129 → 0.089 | 1.000 → 1.000 |
| v2 (125) | 0.867 → 0.867 | 0.192 → 0.149 | 0.738 → 0.810 |
| v3.1 DEV | 0.892 → 0.899 | 0.241 → 0.190 | 0.748 → 0.807 (sibling survival 0.5 → 0.7) |
| v4 DEV | 0.862 → 0.853 | 0.322 → 0.272 | 0.660 → 0.685 |

The v1 loss is two-document queries ("Vietnamese noodle soup tips while cutting", an ice-cream + goal query): the leading document takes three slots and the second required one is displaced.
v3.1 held-out and sealed v4 were not run. N1.5.x coach / chatbot suites pass unchanged (npm test: 2775 passed).

### Verdict

R3-F is a **modest, consistent improvement in wrong-document (−0.04 to −0.05 on every suite) and Section Top-3, for a small Recall@3 and coverage cost; it is not ready for sealed v4.**
Targets vs v4 DEV: wrong-document 0.272 (target ≤ 0.10), Section Top-3 0.685 (≥ 0.90), Recall@3 0.853 (≥ 0.95) — not met.

**Architectural ceiling (lexical + closed-topic concept retrieval).** (1) Document #0 is wrong in ~20% of cases and no document-signal weighting moves that by more than ~3 points, so
wrong-document is bounded at ~0.2 by document ranking; every allocation that cuts it costs Recall@3 about as much (the frontier is coupled through document-ranking uncertainty).
(2) Within a correct document the right section is in the top 3 only 84.5% of the time under every lexical variant tried, because sibling sections differ by *purpose*, not vocabulary.
**Recommendation:** the next phase should evaluate a local embedding reranker, restricted to (a) choosing among sections of the top-ranked documents and (b) breaking document-score ties,
measured on the same DEV split against this F5 baseline before any sealed run. Do not add it to the gate. Not implemented here.

## R3-G — bounded local semantic reranker (DEV only, 2026-10-11) — EXPERIMENT, NOT ACTIVE

Question: does an embedding signal add information the lexical/concept scorer lacks? Runtime stays R3; sealed v4 never touched.

**Approach.** `lib/nutrition/knowledge/semantic-rerank.ts`, opt-in via `ScoreConfig.semantic` (absent = byte-for-byte R3). Embeddings only *reorder* the top-k lexical candidates; nothing outside the lexical pool can enter. No vector DB. **Local inference was impractical** (only an English-only safetensors `bge-small` in the HF cache; no onnxruntime/torch/transformers.js; Vietnamese is a tracked slice), so per brief option B: `text-embedding-3-small` @ 512 dims, server-side, **experiment only** (production chat/Nutrition stays OpenAI-only; no provider-chain change). Vectors are precomputed and replayed from `__tests__/eval/semantic-embeddings-r3g.recorded.json` (key = sha1(model:dims:exact text), so a corpus edit is a miss, never a stale hit; a test fails if any current chunk lacks a vector). Re-record: `NUTRITION_LIVE_EVAL=1 vitest run embed-record.r3g.live.test.ts`.

**Representations (G1, v4 DEV).** Query raw vs raw+structured intent; chunk heading+body vs title-labelled (`"<doc title> - <heading>\n<body>"`; no metadata header). Best: raw query / titled chunk (secT3 0.705, sibling-sensitive T3 0.824). Intent-augmented queries were *worse* (0.675–0.690) — the Layer-2 facets double-count what the lexical score already holds.

**Normalisation (G3).** Min-max of lexical score and of cosine similarity over the candidate pool, blended, then rescaled back into the pool's own [min, max] score range so the selector's category penalty / document cap / floor keep their meaning.

**Candidate budget.** k = 12 (DEV pool after the 0.5 floor: median 10, p75 15, p90 22). k 6→40 sweep: no gain beyond 12 (G1 flat from 12 to 40; G3 k=20 not better), so a wider "rescue" has nothing to rescue.

**Tie band (G2).** Adjacent top-8 gaps: p25 0.000 (29% exact ties), p50 0.012, p75 0.037; top1–top2 p50 0.061; target below top1 by p50 0.078. Grid 0.012 / 0.03 / 0.06 / 0.1.

### Results (v4 DEV, layered gate, 200-ish fired cases; ±0.02 is one or two cases)

| | R@3 | wrong-doc | secT1 | secT3 | sibSens T3 | sib survival | Cov@4 | full@4 | OOV secT3 |
|---|---|---|---|---|---|---|---|---|---|
| R3 (active) | 0.862 | 0.322 | 0.445 | 0.660 | 0.706 | 0.211 | 0.727 | 0.455 | 0.448 |
| R3-F F5 | 0.853 | 0.272 | 0.435 | 0.685 | 0.725 | 0.316 | 0.636 | 0.273 | 0.483 |
| G1 section-only | 0.862 | 0.322 | 0.485 | 0.705 | 0.824 | 0.368 | 0.727 | 0.455 | 0.586 |
| G2 tie ε=0.06 | 0.871 | 0.322 | 0.510 | 0.715 | 0.784 | 0.316 | 0.773 | 0.545 | 0.586 |
| G3 70/30 | 0.876 | 0.317 | 0.485 | 0.730 | 0.784 | 0.263 | 0.773 | 0.545 | 0.621 |
| **G3 50/50** | **0.876** | **0.312** | **0.540** | **0.750** | 0.804 | 0.368 | 0.773 | 0.545 | 0.690 |
| G3 40/60 | 0.876 | 0.294 | 0.585 | 0.745 | 0.824 | 0.474 | 0.773 | 0.545 | 0.690 |
| G4 docε=0.06 | 0.876 | 0.322 | 0.505 | 0.730 | 0.843 | 0.368 | 0.773 | 0.545 | 0.655 |

Four suites (R@3 / wrong-doc / secT3 averages), R3 → G3 50/50: 0.888 → 0.901 / 0.221 → 0.212 / 0.786 → 0.874 (v2 secT3 0.738 → 0.905, v3.1 0.748 → 0.840, v1 unchanged 1.000; v1 wrong-doc 0.129 → 0.139). F5 stays better on wrong-doc (0.175) but G3 is far better on section (0.825 → 0.874) and does not give up multi-document coverage.

**G5 (semantic rescue) not run:** the budget sweep shows no headroom inside the pool.

### Diagnostics (not a runtime path)
- The lexical pool already holds the target section for 90.3% of section cases and the required document for 90.8% of units: the ceiling for any *rerank* is ≈ 0.90 secT3; G3 reaches 0.75.
- Ranking the *whole corpus* by embedding alone: doc R@3 0.858 (R3 lexical: 0.862), section Top-3 0.703. Embeddings ≈ lexical on their own; they are complementary, not superior.
- Wrong-document barely moves because it counts low-score filler chunks inside the top-3 slots, not mis-ordering; reordering cannot remove filler.

### Cost
Query embedding (live, 30 sequential calls): avg ≈ 205 ms, p95 ≈ 260–325 ms, ≈ 48 tokens, 1 call/query. In-process rerank ≈ 0.1 ms (R3 0.83 → 0.91 ms avg retrieval). Corpus vectors: 1,295 recorded texts, 3.4 MB JSON, parse ≈ 10–25 ms, decoded lazily. Context size unchanged (avg 1944 / max 2743 chars). The query call would make `retrieveKnowledge` asynchronous in production — a real design change, not done here.

### Verdict
Embeddings help **sections** (secT3 0.660 → 0.750, sibling-sensitive T1 0.549 → 0.686, OOV 0.448 → 0.690, mixed 0.650 → 0.750) and do not fix **documents** (wrong-doc 0.322 → 0.312). Vietnamese secT3 is flat (0.742): not helped, not hurt. Public targets still not met (R@3 0.876 < 0.95; wrong-doc 0.312 > 0.10; secT3 0.750 < 0.90). Tests: `__tests__/eval/retrieval-r3g.test.ts`.

## R3-H — hybrid document signal + semantic section rerank (DEV only, 2026-10-11) — EXPERIMENT, NOT ACTIVE

Code: `lib/nutrition/knowledge/hybrid.ts` (opt-in `ScoreConfig.hybrid`; absent = R3 byte-for-byte), lab `__tests__/eval/{semantic-lab,r3h-diag,r3h-experiments.print}`, tests `retrieval-r3h.test.ts`. Replay: `R3H=<base|h1|h3|h2|h4|four|four2|diag|dist|facets|final|diff> npx vitest run .../r3h-experiments.print.test.ts`. Sealed v4 never touched.

Pipeline: R3 candidate pool -> G3 semantic section rerank (raw query vs titled chunks, k=12, 40/60) -> F5 document score as a prior (`bestSem * (w*relDoc + (1-w)*sem/bestSem)`) -> normal selector -> structural multi-document guard. Gate unchanged; missing vector => exact R3 (whole hybrid skipped).

| v4 DEV | R3 | F5 | G3 | H1 prior .5 | H2 tie .02 | H3 prior .3 / sem .6 | **R3-H (H3 + goal-doc guard)** |
|---|---|---|---|---|---|---|---|
| R@3 | .862 | .853 | .876 | .866 | .876 | .880 | **.885** |
| wrong-doc | .322 | .272 | .312 | .271 | .301 | .273 | **.240** |
| Section T3 | .660 | .685 | .750 | .745 | .750 | .755 | **.780** |
| Coverage@4 / full | .727/.455 | .636/.273 | .773/.545 | .773/.545 | .773/.545 | .773/.545 | **.773/.545** |
| four-suite avg R@3 / wrong / secT3 | .888/.221/.786 | .876/.175/.825 | .901/.212/.874 | .882/.190/.887 | .899/.205/.874 | .904/.193/.885 | **.903/.159/.899** |

- H1 repeats F5's v1 loss (v1 R@3 .930 -> .884): rejected. H2 (eps from the G3 gap distribution: p25 .004 / p50 .012 / p75 .029): wrong-doc .301-.307, rejected. H3 grid (prior .1/.2/.3 x sem .5/.6): .3/.6 best. Score-ratio evidence for multi-document does NOT separate multi- from single-document queries (strongest non-lead doc ratio: multi p50 .63, single p50 .81), nor do facet counts; H4 therefore uses query structure (stated goal + non-goal leader => compatible goal document needed). Equal to the best ratio variant (.9/.9) on all four suites. Coverage@4 did not improve over G3; the wrong-doc gain comes from the goal document replacing a distractor.
- Wrong-doc sits at chunk positions #2/#3 (R3 .38/.41, R3-H .22/.34); 2nd-document usefulness is only .47. Section target is in the lexical top-12 pool for .865 of section cases (post-rerank Top-3 .775): ~.09 ranking loss, ~.135 candidate generation, 21% of targets have no local lexical evidence.
- Latency (replay): R3 0.82 -> R3-H ~1.5 ms avg; query embedding live avg ~205 ms, 1 call/query, ~48 tokens (R3-G measurement); context unchanged (avg 1967 / max 2743 chars).
- Verdict: not at public targets (wrong-doc .24 vs .10, Section T3 .78 vs .90). Corpus-granularity bottleneck likely. Do not tune further.

## R3-I — corpus granularity & candidate-generation audit (DEV only, 2026-10-11)

R3-H (weights, k=12, goal guard, gate, intent schema) is unchanged. Sealed v4 was not read or run. Tooling (test-only, DEV): `__tests__/eval/r3i-audit.print.test.ts` (`R3I=pool|miss|slots|filler|cases|eval|labels|queries|breakdown`), `r3i-record.live.test.ts` (`R3I_RECORD=1`, embeds only changed titled + body chunk texts).

**Hard constraint found.** The frozen DEV/v1/v2/v3.1 labels pin 93 of 141 section ids (slug = heading), so headings of labelled sections cannot be renamed, split or merged without a benchmark id-migration. Only unlabelled sections, bodies, document metadata and new content were editable. Heading-level fixes for labelled sections are listed as follow-ups, not done.

**Findings (baseline R3-H, DEV v4).** Target section in the floor-limited lexical pool: .865 (top-3 .690, top-6 .810, top-12 .875). 27 section misses: 14 no lexical/metadata evidence reaching `minScore` (A), 7 Vietnamese/mixed with no concept (D), 3 pool cap (E), 2 relative floor (I), 1 metadata gate (B). Wrong-doc slots: 254 across 4 positions (#1 .162 #2 .218 #3 .342 #4 .593); 205 (81%) were filler after every required document was already present, 49 had the required document absent from the pool; 86 of the filler slots displaced a higher-scored acceptable chunk (selector penalties/cap), 168 had no better acceptable chunk (corpus-limited). Top slot thieves were makeover/craving boilerplate (`fried_chicken::high-leverage-strategies`, `cereal::preserve-high-value-sensory-features`, ...) and meat "cut" sections matching the goal word "cut".

**Shipped (all body/new-section edits; no id of a labelled section changed).**
1. "cut" as a meat word -> "piece/meat/versions" in hawker, Vietnamese and fried-chicken bodies (polysemy collision with the goal word).
2. `fat_loss::ordering-at-restaurants-and-takeaways` (new): cross-cuisine eating-out strategy for ramen/curry/pasta/sushi/café/delivery, where only hawker/Vietnamese sections existed.
3. `fat_loss::preserve-preferred-foods-where-reasonable` body in user-facing words (5 DEV targets, 0 retrievals before).
4. Vietnamese dish names in Vietnamese script (phở, bún bò Huế, cơm tấm, gỏi cuốn, chả giò) in the existing sections (diacritics are not folded by `normalize.ts`; a dictionary was not added).
5. `core.basics::energy-balance-as-a-planning-framework` gains the maintenance sentence; `uncertainty::restaurant-and-hawker-uncertainty`, `flavor_hacks::salt`, `texture_hacks::volume`, `fat_loss::high-leverage-substitutions` bodies use the user-facing words (restaurant/takeaway, sodium, bigger plate, swap/trim).

**Tried and rejected on DEV (do not repeat).** Removing `sensoryTargets` from the three makeover docs (neutral). Folding all "Core goal" sections into the doc intro (cuisine R@3 .825 -> .775: they carry document identity). A stand-alone cross-cuisine `eating_out` document (R@3 -1.3 pt, wrong-doc +0.8 pt, 17 DEV cases got it as a wrong document because frozen labels cannot credit a new document; the same knowledge as one goal-document section works). Separate basics sections for maintenance / meal frequency / late-day gap (no measurable gain, small R@1/R@3 cost). Deleting the unlabelled `fast_food::identify-what-the-user-actually-wants` (R@3 -0.5, secT3 -1.0).

**Fragility note.** Adding words changes corpus idf: a 0.29 vs 0.30 `minScore` knife-edge flipped a multi-document case (`d4-md11`) when the word "size" was added to a new section. Check `Coverage@4` and the R3-H tests after every wording change.

**Result (DEV v4, same gate recordings).** R@1 .719 -> .756, R@3 .885 -> .903, e2e R@3 .853 -> .871, wrong-doc .240 -> .218, Section T1 .535 -> .555, T3 .780 -> .800, wrong-section .313 -> .311, Coverage@4 .773 / full .545 (unchanged). Four-suite average: R@3 .903 -> .917, wrong-doc .159 -> .147, secT3 .899 -> .900. Public targets (wrong-doc .10, secT3 .90) are still not met.

**R3-I-S (selector fill) — confirmed, not fixed.** The selector always fills 4 primaries (3.85 on average) and the 3-per-document cap with k=4 forces slot #4 to another document. After the corpus changes 199 of 239 wrong slots are still "required documents already present" filler; 88 of those displaced a better-scoring acceptable chunk. A relevance-gated fill (or fewer primaries when the next candidate is far below the leader) is the next lever and is a selector change.
