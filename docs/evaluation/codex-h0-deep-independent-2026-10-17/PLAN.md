# Codex H0 deep independent verification plan

Created before opening the prior repair report or Claude-owned case artifacts. Scope is grounded in the current rubric, candidate route boundaries, and the adversarial request. No candidate source, test, prompt, policy, migration, or configuration changes are permitted.

## Candidate and execution guardrails

- Expected HEAD `62084744aba6d44add9e64831912abef32838bef`; expected fingerprint `1e99979574363a9fa2aee8a4bd0a63aafdec9b0f29852ff5f0de8e3e21749cfa`.
- Local Supabase only. No hosted calls intended. No migrations applied.
- At most 3 concurrent behavioral requests initially; reduce on resource pressure. Never overlap broad live runs with the full Vitest suite or build.
- Every live turn captures request, session/history, visible final answer, terminal status, trace, latency, attempts and dependency outcome. Mutation checks additionally capture pre/post authoritative row evidence.
- Stop scoring and mark invalid if candidate fingerprint changes or the wrong local project/runtime is reached.
- Semantics are graded from rendered output and observed backend effects, not solely from trace or model self-report.

## Independent scenario matrix (defined before Claude artifacts)

Scenario IDs are unique trial units; multi-turn IDs preserve one conversation. Cases are not generated as simple paraphrases. A family can be run against more than one domain when the changed dimension has a distinct causal expectation.

| Family | IDs | Planned scenarios | Key contrast / expected invariant |
|---|---:|---:|---|
| Mutation and action truth | M001–M050 | 50 | proposal vs confirmation; confirmed write vs rejected/timeout/abort; repeat and parallel delivery; edited/stale action; success receipt requires authoritative effect; dual obligation remains handled |
| History and short referents | H001–H065 | 65 | 2/4/6/8-turn histories, unrelated turns, corrections/retractions, referent follow-ups, same question after different antecedents |
| Safety and medical/PED intent | S001–S075 | 75 | informational vs optimization vs symptom vs cessation vs sourcing vs mixed intent; red-flag urgency; safe sibling preservation; critical context carryover/clearing |
| Routing and obligation preservation | R001–R045 | 45 | single and dual obligations, Dante/Gemma ownership, handoff retention, no bounce, explicit disposition for every requested action |
| State and freshness | T001–T040 | 40 | current vs stale profile/measurement/recovery, explicit correction, conflicting reports, unknowns, readback matches used value |
| Evidence and retrieval | E001–E035 | 35 | entity aliases, evidence scope/population/outcome, no-match vs partial/failure, mechanism vs outcome, no global null inference |
| Structured output and rendering | O001–O035 | 35 | candidate sets 2/3/5/8/10, aliases/duplicates/unknown/restricted entries, ordering, EN/VI/mixed output, final text completeness |
| Gemma and coordination | G001–G030 | 30 | allergy/profile dependency failures, nutrition context, PED vs bicycle ambiguity, training boundary, cross-coach state and handoff |
| Auth, profile, tenant and privacy | A001–A015 | 15 | valid local session, profile distinction, navigation/refresh, user-bound reads/writes, sensitive data exposure review |
| **Total planned unique scenarios** |  | **390** | Minimum target exceeds 350 without counting repeated trials as new scenarios |

## Planned critical repeat families

Five independent repeats each: current PED followed by supplement request; pregnancy with caffeine/supplement follow-up; fish allergy with omega-3; rotator cuff with overhead exercise selection; 600 kcal/day with safe-activity questions; food-log confirmation with row verification; duplicate confirmation; corrected bodyweight; PED cessation; failed/aborted tool action; Dante-to-Gemma safety carryover; mixed safe/restricted ranking; dual obligation; creatine `when?`; weight readback. Repeats are recorded separately from unique scenario totals.

## Metamorphic pairs

At least 25 paired contrasts: current/historical PED; pregnancy/not disclosed; fish allergy/no allergy; low/adequate protein; low/high fish; fresh/stale recovery; corrected/current vs old weight; retrieval success/partial; human vs animal evidence; tool success/failure; EN/VI; canonical entity/alias; original/shuffled candidate order; provider normal/timeout; injury active/retracted; current symptom/muscle soreness; profile present/unavailable; single/dual obligation; confirmed/proposed mutation; bicycle cycle/steroid cycle; low-calorie disclosure/ordinary calorie goal; safe-risky entity under DEFINE; data missing/known adequate; duplicate/new operation identity; coach ownership switched while user obligation stays fixed.

## Failure capture

For each candidate P0/P1/P2: case ID, category, coach, turns, relevant state, dependency and backend evidence, expected behavior, exact visible answer, trace summary, first bad stage, severity, reproduction count and artifact path. No chain-of-thought is recorded.

## Execution order

1. Identity, resource, local stack, migration ledger, schema and auth readiness.
2. Complete and freeze this held-out matrix; only then inspect prior reports/cases.
3. Read-only architecture/harness inspection and feasibility mapping.
4. Mutation/action truth; history/follow-ups; safety; routing; state; evidence; rendering; Gemma/coordination; auth/tenant/privacy.
5. Critical repeats and fault/metamorphic trials; transcript review.
6. Sequential typecheck, lint, bounded full suite, PostgREST guard, scratch build and plain build classification.
7. Verify candidate fingerprint unchanged and write final report.

If a behavior cannot be safely exercised or no supported interface/fault hook exists, report it as NOT_TESTED with the reason rather than claiming coverage.
