# Dante Phase 4 observability contract

The internal dashboard is admin protected and always queries one explicit `user_id`. RLS and query filters both enforce scope. It is diagnostic only and has no production write or promotion control.

## Field contract

| Dashboard field | Source event/table | Source module | Required identity/time/provenance |
| --- | --- | --- | --- |
| Current athlete state at T0 | `RECOMMENDATION_TRACE` / `dante_phase4_validation_events` | `validation/instrumentation.ts` | user, recommendation, captured/occurred timestamps, Phase 3 source |
| Production recommendation/decision | `SHADOW_DECISION` / `dante_phase3_shadow_events` | `shadow/shadow-runtime.ts` | user, recommendation, occurred timestamp |
| Expected outcome and horizon | `SHADOW_DECISION` / `dante_phase3_shadow_events` | `shadow/shadow-runtime.ts` | user, recommendation, occurred timestamp |
| Shadow meta-action and reasons | `SHADOW_DECISION` / `dante_phase3_shadow_events` | `shadow/adaptive-control.ts` | user, recommendation, context, uncertainty, reasons |
| Actual outcome | `OUTCOME_LINKED` / `dante_phase3_shadow_events` | `shadow/shadow-runtime.ts` | user, recommendation, outcome timestamp, raw source retained |
| Dimension errors / mixed status | `PREDICTION_EVALUATED` / `dante_phase4_validation_events` | `validation/typed-outcomes.ts` | user, recommendation, Phase 3 event provenance |
| Uncertainty at T0 | `RECOMMENDATION_TRACE` | `shadow/adaptive-control.ts` | user, recommendation, timestamp |
| Uncertainty after information | future appended validation event; never overwrite T0 | validation instrumentation | same user/recommendation plus parent/source event |
| Drift status | Phase 3 shadow trace and `DRIFT_EVALUATED` | `shadow/adaptive-control.ts`, `validation/drift-validation.ts` | user, context, policy, timestamp, evidence points |
| Strategy evidence | shadow strategy scores plus Phase 2 observation/pattern rows | `shadow/adaptive-control.ts`, `memory-hierarchy/*` | user, context, observation provenance |
| RAW memory | `app_events` and `dante_observations` | `events/emit.ts`, `memory-hierarchy/record-observation.ts` | immutable source ID, user, observed time |
| CANDIDATE/PROMOTED belief | `dante_learned_patterns` | `memory-hierarchy/consolidate.ts` | user, tier/status, evidence counters, first/last time |
| MERGED/REVISED/QUARANTINED/REJECTED | append-only `CONSOLIDATION_DECISION` when emitted | `shadow/consolidation-governor.ts` | user, candidate, preserved episode IDs, reason codes |
| Calibration | `CALIBRATION_UPDATED` and future `CALIBRATION_EVALUATED` | `shadow/outcome-calibration.ts`, `validation/calibration.ts` | user, recommendation, domain, probability/outcome provenance |
| Missing/unresolved/unusable data | derived from explicit trace status | `validation/dashboard.ts` | user, recommendation, window, reason |
| Safety events | reason-coded Phase 1/Phase 3 event | Phase 1 safety and shadow observer | user, event time, reason; no sensitive free-text expansion |
| Fallback/tool failures | existing tool observability plus `INSTRUMENTATION_FAILURE` | `tools/observability.ts`, Phase 4 | user, tool/event, timestamp, failure class |
| Why belief changed | source observations and consolidation decision | memory hierarchy / consolidation governor | user, source episode IDs, old/new state, reason |
| Why confidence changed | calibration or pattern evidence record | outcome calibration / consolidate | user, domain, evidence identifiers, formula inputs |

The dashboard renders absent data as absent. It does not infer outcomes, join athletes, display secrets, collect psychological profiles, or turn a missing event into a negative outcome.

## Required views

The initial surface provides pilot overview, one-athlete chronological trace, raw-observation provenance, learned-pattern state, shadow evidence, data-quality issues, and a non-promoting readiness report. Additional views must be built from the fields above rather than speculative collection.
