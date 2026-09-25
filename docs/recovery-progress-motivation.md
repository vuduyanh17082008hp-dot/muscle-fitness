# Recovery adaptive loop, progress journey, motivation

Canonical sources stay the existing tables. These features are derived
read-models plus one additive mutation audit table.

## Recovery adaptive loop

1. `recovery_checkins` remains the immutable daily source (upsert by
   `user_id, checkin_date`).
2. `computeRecoveryScore()` is still the only score writer.
3. `deriveRecoveryState()` projects that score + check-in into a
   provenance-bearing `RecoveryState`. Notes stay raw user text.
4. `deriveWorkoutSafetyScope()` reuses P-21 area/activity language.
   `PERSIST` keeps context available; it is not a global lock.
5. `generateWorkoutAdjustmentProposal()` is deterministic. The LLM does
   not create the patch.
6. Preview is UI-only. Apply runs `applyWorkoutAdjustment()` after an
   explicit confirm: auth, ownership, version, structured patch,
   idempotent `proposalId`.

## Progress journey

`buildProgressJourney()` aggregates `workout_sessions`,
`recovery_checkins`, and `food_logs` in the user's timezone with Monday
week starts (`lib/training/week-bucketing.ts`). Streaks count planned
training completion and planned rest. `NO_REQUIREMENT` days do not break
a streak. Missing comparison metrics are omitted.

## Motivation

Presentation-only. `selectMotivationLine()` picks from a fixed bank,
once per local day, and can be turned off in Settings
(`mf.motivation.enabled`). It never writes canonical state.

## Safety / Dante

P-21 conversation persistence is unchanged. This loop only scopes
today's workout proposal. Dante still receives Athlete State; it does
not compute streaks, weeks, or mutations.
