-- =========================================================
-- MUSCLE FITNESS
-- HAWKERLENS SG — SCAN PREDICTIONS
--
-- Stores the ORIGINAL model prediction separately from what the user
-- actually confirmed (spec Part A §9: "saved separately... enables
-- future model evaluation"). The confirmed food itself is saved as
-- normal food_logs rows via the SAME createFoodLog() path every other
-- input method uses (source = 'ai_estimate', which already exists in
-- food_logs_source_check) — this table is prediction/eval metadata,
-- not a duplicate of food_logs.
-- =========================================================

create table if not exists
public.hawkerlens_scans
(
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid
        not null
        references auth.users(id)
        on delete cascade,

    -- Null when the dish could not be classified (unknown dish /
    -- low-quality image) — the scan is still recorded for benchmark
    -- purposes even when it didn't produce a usable result.
    dish text,

    dish_confidence numeric(4,3),

    image_quality jsonb
        not null
        default '{}'::jsonb,

    -- Original model output, before any user edit.
    components_predicted jsonb
        not null
        default '[]'::jsonb,

    nutrition_predicted jsonb,

    overall_confidence numeric(4,3)
        not null
        default 0,

    -- Filled in only if/when the user confirms and saves — the
    -- delta between this and components_predicted is exactly what
    -- future model evaluation needs.
    components_confirmed jsonb,
    confirmed_at timestamptz,

    -- Path within the 'hawkerlens-photos' bucket. Nullable: saving
    -- the photo is optional (see components/hawkerlens), same
    -- pattern as SetVision's video.
    image_storage_path text,

    created_at timestamptz
        not null
        default now(),

    constraint
        hawkerlens_scans_dish_check
    check
    (
        dish is null
        or dish in (
            'chicken_rice', 'cai_png', 'nasi_lemak', 'laksa',
            'bak_chor_mee', 'ban_mian', 'char_kway_teow',
            'fish_soup', 'mee_goreng', 'mala'
        )
    ),

    constraint
        hawkerlens_scans_confidence_check
    check
    (
        overall_confidence between 0 and 1
    )
);

create index if not exists
hawkerlens_scans_user_created_idx
on public.hawkerlens_scans
(user_id, created_at desc);

-- =========================================================
-- RLS
-- =========================================================

alter table
public.hawkerlens_scans
enable row level security;

drop policy if exists
"hawkerlens_scans_select_own"
on public.hawkerlens_scans;

create policy
"hawkerlens_scans_select_own"
on public.hawkerlens_scans
for select
using
(
    auth.uid() =
    user_id
);

drop policy if exists
"hawkerlens_scans_insert_own"
on public.hawkerlens_scans;

create policy
"hawkerlens_scans_insert_own"
on public.hawkerlens_scans
for insert
with check
(
    auth.uid() =
    user_id
);

drop policy if exists
"hawkerlens_scans_update_own"
on public.hawkerlens_scans;

create policy
"hawkerlens_scans_update_own"
on public.hawkerlens_scans
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
"hawkerlens_scans_delete_own"
on public.hawkerlens_scans;

create policy
"hawkerlens_scans_delete_own"
on public.hawkerlens_scans
for delete
using
(
    auth.uid() =
    user_id
);

-- =========================================================
-- STORAGE — PRIVATE PHOTO BUCKET
-- =========================================================

insert into storage.buckets
    (id, name, public, file_size_limit)
values
    ('hawkerlens-photos', 'hawkerlens-photos', false, 20971520) -- 20MB
on conflict (id) do nothing;

drop policy if exists
"hawkerlens_photos_select_own"
on storage.objects;

create policy
"hawkerlens_photos_select_own"
on storage.objects
for select
using
(
    bucket_id = 'hawkerlens-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists
"hawkerlens_photos_insert_own"
on storage.objects;

create policy
"hawkerlens_photos_insert_own"
on storage.objects
for insert
with check
(
    bucket_id = 'hawkerlens-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists
"hawkerlens_photos_delete_own"
on storage.objects;

create policy
"hawkerlens_photos_delete_own"
on storage.objects
for delete
using
(
    bucket_id = 'hawkerlens-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
);
