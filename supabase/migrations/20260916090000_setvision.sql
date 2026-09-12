-- =========================================================
-- MUSCLE FITNESS
-- SETVISION — COMPUTER VISION ANALYSIS RESULTS
--
-- Stores STRUCTURED analysis output only (spec Part B §26).
-- Uploaded video is never written into a table row — it lives in
-- Supabase Storage (bucket below) and this table stores only the
-- storage path, plus the deterministic metrics SetVision computed
-- from it, which is what Dante Core and the UI actually consume.
-- =========================================================

create table if not exists
public.setvision_analyses
(
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid
        not null
        references auth.users(id)
        on delete cascade,

    -- Optional association with a logged workout, so an analysis can
    -- be attached to the set it was recorded for. Both nullable: a
    -- standalone analysis (not tied to a logged session) is valid.
    workout_session_id uuid
        references public.workout_sessions(id)
        on delete set null,

    session_exercise_id uuid
        references public.workout_session_exercises(id)
        on delete set null,

    exercise text
        not null,

    -- Path within the 'setvision-videos' storage bucket, scoped
    -- "<user_id>/<filename>" (enforced by the storage policies
    -- below). Null once a video is deleted independently of its
    -- analysis — the metrics remain valid on their own.
    video_storage_path text,

    reps smallint
        not null
        default 0,

    rom_consistency numeric(4,3),
    tempo_consistency numeric(4,3),
    bar_path_consistency numeric(4,3),
    asymmetry_deg numeric(5,2),

    average_eccentric_time_sec numeric(5,2),
    average_concentric_time_sec numeric(5,2),

    velocity_calibrated boolean
        not null
        default false,

    velocity_unit text
        not null
        default 'torso-lengths/s',

    velocity_mean numeric(6,3),
    velocity_peak numeric(6,3),
    velocity_final numeric(6,3),
    velocity_loss numeric(4,3),

    exercise_classification_confidence numeric(4,3),
    confidence numeric(4,3)
        not null
        default 0,

    -- Free-form arrays kept as jsonb rather than new tables: this is
    -- per-analysis debug/detail data (why the confidence is what it
    -- is, per-rep ROM/tempo), not something ever queried across rows.
    limitations jsonb
        not null
        default '[]'::jsonb,

    per_rep jsonb,

    analyzed_at timestamptz
        not null
        default now(),

    created_at timestamptz
        not null
        default now(),

    constraint
        setvision_analyses_exercise_check
    check
    (
        exercise in
        ('bench_press', 'squat', 'deadlift')
    ),

    constraint
        setvision_analyses_reps_check
    check
    (
        reps >= 0
    ),

    constraint
        setvision_analyses_confidence_check
    check
    (
        confidence between 0 and 1
    ),

    constraint
        setvision_analyses_velocity_unit_check
    check
    (
        velocity_unit in
        ('m/s', 'torso-lengths/s')
    )
);

-- =========================================================
-- INDEXES
-- =========================================================

create index if not exists
setvision_analyses_user_analyzed_idx
on public.setvision_analyses
(user_id, analyzed_at desc);

create index if not exists
setvision_analyses_session_exercise_idx
on public.setvision_analyses
(session_exercise_id)
where session_exercise_id is not null;

-- =========================================================
-- RLS — TABLE
-- =========================================================

alter table
public.setvision_analyses
enable row level security;

drop policy if exists
"setvision_analyses_select_own"
on public.setvision_analyses;

create policy
"setvision_analyses_select_own"
on public.setvision_analyses
for select
using
(
    auth.uid() =
    user_id
);

drop policy if exists
"setvision_analyses_insert_own"
on public.setvision_analyses;

create policy
"setvision_analyses_insert_own"
on public.setvision_analyses
for insert
with check
(
    auth.uid() =
    user_id
);

drop policy if exists
"setvision_analyses_update_own"
on public.setvision_analyses;

create policy
"setvision_analyses_update_own"
on public.setvision_analyses
for update
using
(
    auth.uid() =
    user_id
)
with check
(
    auth.uid() =
    user_id
);

drop policy if exists
"setvision_analyses_delete_own"
on public.setvision_analyses;

create policy
"setvision_analyses_delete_own"
on public.setvision_analyses
for delete
using
(
    auth.uid() =
    user_id
);

-- =========================================================
-- STORAGE — PRIVATE VIDEO BUCKET
--
-- Not public. Every object path must be "<user_id>/<filename>" —
-- enforced by the policies below via storage.foldername(name)[1].
-- =========================================================

insert into storage.buckets
    (id, name, public, file_size_limit)
values
    ('setvision-videos', 'setvision-videos', false, 524288000) -- 500MB
on conflict (id) do nothing;

drop policy if exists
"setvision_videos_select_own"
on storage.objects;

create policy
"setvision_videos_select_own"
on storage.objects
for select
using
(
    bucket_id = 'setvision-videos'
    and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists
"setvision_videos_insert_own"
on storage.objects;

create policy
"setvision_videos_insert_own"
on storage.objects
for insert
with check
(
    bucket_id = 'setvision-videos'
    and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists
"setvision_videos_delete_own"
on storage.objects;

create policy
"setvision_videos_delete_own"
on storage.objects
for delete
using
(
    bucket_id = 'setvision-videos'
    and auth.uid()::text = (storage.foldername(name))[1]
);
