-- =========================================================
-- MUSCLE FITNESS
-- SETVISION — MULTI-EXERCISE ENGINES + MANUAL REVIEWS
--
-- Additive and backward compatible:
--   * `exercise` accepts the new movement-family engine ids and
--     'manual_review' (a saved video review that ran no engine — custom
--     exercises and exercises without an engine). Existing values stay valid.
--   * `reps` and `confidence` may be NULL: a manual review has no automated
--     rep count or tracking-quality score, and storing 0 would be a made-up
--     value. Existing rows keep their numbers; the CHECKs still hold.
-- RLS is unchanged (own rows only). The user's reviewed reps, notes and
-- custom exercise name ride in per_rep jsonb (validated server-side by
-- app/api/setvision/results) — nothing is written to the exercise catalogue.
-- =========================================================

alter table public.setvision_analyses
    drop constraint if exists setvision_analyses_exercise_check;

alter table public.setvision_analyses
    add constraint setvision_analyses_exercise_check
    check
    (
        exercise in
        (
            'bench_press', 'squat', 'deadlift',
            'vertical_press', 'vertical_pull', 'horizontal_pull',
            'elbow_flexion', 'triceps_pushdown', 'overhead_triceps_extension',
            'lateral_raise',
            'manual_review'
        )
    );

alter table public.setvision_analyses
    alter column reps drop not null;

alter table public.setvision_analyses
    alter column confidence drop not null;
