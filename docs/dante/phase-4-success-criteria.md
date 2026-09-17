# Dante Phase 4 success criteria

Status: infrastructure specification. None of the thresholds below is evidence that Dante is scientifically valid. Phase 4 is `VALIDATION_ONLY`; production remains authoritative and Phase 3 remains `SHADOW`.

## A. Engineering gates

These are release-blocking properties of the software, not effectiveness claims.

- P0 safety failures: count of incidents where an unsafe response passes the Phase 1 safety boundary. Target: 0.
- Cross-user contamination: count of events, reads, links, or aggregates containing another `user_id`. Target: 0.
- Raw evidence corruption: count of raw episodes updated, deleted, or overwritten by validation code. Target: 0.
- Unauthorized production modification: count of production decisions affected by Phase 3 or 4 output. Target: 0.
- Link integrity: every linked outcome must share `user_id` and an explicit `recommendation_id` with its source. Target: 100%; denominator is all linked outcomes.
- Failure containment: injected Phase 4 write/query/metric failures must leave production, Phase 1, Phase 2, and Phase 3 available. Target: 100%; denominator is injected failure scenarios.

Any nonzero P0 count is FAIL. No data is not a pass.

## B. Pilot feasibility metrics

These determine whether a later longitudinal study can be operated. Thresholds must be registered before a pilot and may be changed only with a dated rationale.

- Recommendation trace completeness = eligible recommendations with state, production decision, expected outcome, shadow decision, timestamp, user, and provenance / all eligible recommendations.
- Expected-outcome trace completeness = eligible recommendations with at least one explicitly predicted dimension / all eligible recommendations.
- Outcome linkage rate = mature eligible recommendations with exactly one valid outcome / all mature eligible recommendations.
- Raw evidence provenance = structured outcomes retaining a raw source identifier or source event / all structured outcomes.
- Strategy-evidence provenance = strategy evidence linked to independent outcome evidence / all strategy-evidence records.
- Memory promotion provenance = promoted or revised beliefs with source episode identifiers / all promoted or revised beliefs.
- User burden = completed follow-up prompts and estimated response minutes per athlete-week; report median, range, and missingness.
- Instrumentation availability = successfully persisted eligible events / attempted eligible event writes. A failed write is reported, never inferred as persisted.

An eligible recommendation is a finalized production recommendation with a user ID, timestamp, explicit expected-outcome horizon, and at least one non-unknown expected dimension. A mature recommendation has reached its registered outcome window. A complete event trace has all required T0 and T1 fields and one valid link. An incomplete trace lacks any required field. A missing outcome has no observation after maturity. An unresolved outcome has evidence but cannot be safely interpreted or linked. An unusable outcome is corrupt, outside the registered window, wrong-user, or incompatible in type; it remains retained and excluded from evaluable denominators.

Missing outcomes are not failures and unresolved outcomes are not negative outcomes. Each is reported separately. Rates use the denominators stated above; a zero denominator is `INSUFFICIENT_DATA`, not 0% or PASS.

## C. Future scientific validation metrics

These require real longitudinal participants, preregistration, adequate power, and independently collected outcomes.

### Calibration

For a binary outcome with an explicit probability, Brier score = `sum((p_i - y_i)^2) / N`, where N includes only mature, correctly linked, evaluable predictions in the same registered domain/window. ECE may be reported as `sum_b(n_b/N * abs(accuracy_b - confidence_b))` using preregistered bins. Domains are never pooled merely to increase N. Missing, unresolved, unusable, and non-probabilistic predictions are excluded and their counts/rates are reported. No probability is synthesized from qualitative confidence.

For continuous, percentage, categorical, ordinal, boolean, and structured-subjective predictions, report the domain-specific dimension error defined in code. Mixed dimension results remain `MIXED`; they are not collapsed into success.

### Drift

- True drift: a preregistered, independently labeled persistent state change.
- Candidate: configured magnitude, persistence, and confidence conditions reach the candidate threshold.
- Confirmed: an explicit trusted transition or all configured inferred-drift conditions reach confirmation.
- False positive = predicted confirmed drift without a true-drift label / all predicted confirmed drift with labels.
- False negative = true-drift labels without confirmed detection inside the registered window / all true-drift labels.
- Persistence is the number or duration of qualifying independent observations, as preregistered per domain.
- Magnitude is the domain-specific change from the registered baseline.
- Confidence is evidence quality, not prediction accuracy.

One event is an anomaly unless a domain policy explicitly treats a trusted state declaration as an immediate transition. Prediction error is never drift input.

### Stability

- Oscillation: preregistered alternating directional adjustments in a comparable context.
- Runaway adaptation: cumulative adjustment exceeds a registered safe bound without independent improvement evidence.
- Repeated directional adjustment: consecutive same-direction changes inside a registered window.
- Stability intervention: a Phase 3 shadow recommendation to wait, abstain, or seek information; it has no production authority.
- Self-created evidence: compliance with Dante's own recommendation reused as proof of that recommendation's superiority. Target: 0 accepted instances.

### Shadow value

Agreement and disagreement are descriptive only. An evaluable disagreement requires defined production and shadow alternatives, overlapping expected dimensions, an actual outcome, acceptable confounding, and comparable context. Information-seeking value is supported only when a shadow `ASK`/`RETRIEVE` targets information that later proves decision-relevant. The system never labels shadow “better” from observational disagreement alone.

Future primary endpoints, effect sizes, sample sizes, analysis windows, attrition rules, and promotion thresholds belong in a preregistered protocol. Phase 4 implementation alone cannot satisfy them.

The readiness-report implementation therefore has no built-in scientific threshold defaults. Metric gates stay `INSUFFICIENT_DATA` until a preregistered threshold configuration and the required measured inputs are supplied. Even a fully passing report remains advisory and cannot change `SHADOW` mode.
