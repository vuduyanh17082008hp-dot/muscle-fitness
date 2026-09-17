# Dante Phase 4 feasibility pilot guide

This guide supports a future pilot; it does not claim a pilot has run or that Dante is effective.

## Purpose

Verify event capture, outcome collection, missing-data classification, participant burden, event frequency and variance, dashboard usefulness, isolation, and instrumentation failure handling. Keep production authoritative and Phase 3/4 observational.

## Before enrollment

1. Approve a protocol and data-minimization review.
2. Register recommendation eligibility, follow-up windows, outcome types, context rules, drift policies, burden measures, and stopping rules.
3. Exercise synthetic A–I timelines and injected persistence/query failures.
4. Apply migrations in a controlled environment and verify RLS as athlete A, athlete B, admin, and anonymous roles.
5. Define operational owners for safety review and instrumentation incidents.

## During the pilot

Review trace completeness, linkage, unresolved/missing/unusable outcomes, response time/burden, instrumentation availability, safety events, and cross-user checks. Never backfill a fabricated outcome. Corrections are appended with provenance. Treat dashboard or metric outages as validation-data failures, not production failures.

## Exit report

Report counts and denominators, distributions rather than only averages, every protocol deviation, attrition, missingness by cause, and all P0–P4 defects. Feasibility does not establish benefit, calibration improvement, drift accuracy, or shadow superiority.

No participant count is a scientific truth. A later validation sample size must follow its primary endpoint, effect size, variance, event frequency, repeated-measures structure, and attrition assumptions.
