-- =========================================================
-- MUSCLE FITNESS
-- NUTRITION TRACKING — DAILY FOOD LOGS
-- =========================================================

create table if not exists
public.food_logs
(
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid
        not null
        references auth.users(id)
        on delete cascade,

    log_date date
        not null
        default current_date,

    meal_type text
        not null
        default 'snack',

    -- =====================================================
    -- FOOD IDENTITY
    -- =====================================================

    food_name text
        not null,

    brand text,

    source text
        not null,

    source_id text,
    barcode text,

    -- =====================================================
    -- QUANTITY (deterministic scaling always happens from
    -- these grams — never re-derived from calories)
    -- =====================================================

    quantity_grams numeric(8,2)
        not null,

    -- =====================================================
    -- MACROS AT THE LOGGED QUANTITY (already scaled —
    -- see lib/nutrition/food-log-calculator.ts)
    -- =====================================================

    calories numeric(8,2)
        not null,

    protein_g numeric(8,2)
        not null,

    carbs_g numeric(8,2)
        not null,

    fat_g numeric(8,2)
        not null,

    fiber_g numeric(8,2),

    -- =====================================================
    -- PROVENANCE — never silently hide an estimate as exact
    -- =====================================================

    is_estimated boolean
        not null
        default false,

    estimation_confidence text,
    estimation_reason text,
    estimated_from text,

    notes text,

    created_at timestamptz
        not null
        default now(),

    updated_at timestamptz
        not null
        default now(),

    constraint
        food_logs_meal_type_check
    check
    (
        meal_type in
        ('breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout')
    ),

    constraint
        food_logs_source_check
    check
    (
        source in
        ('usda', 'open-food-facts', 'local', 'user_provided', 'ai_estimate')
    ),

    constraint
        food_logs_quantity_check
    check
    (
        quantity_grams > 0
    ),

    constraint
        food_logs_calories_check
    check
    (
        calories >= 0
    ),

    constraint
        food_logs_protein_check
    check
    (
        protein_g >= 0
    ),

    constraint
        food_logs_carbs_check
    check
    (
        carbs_g >= 0
    ),

    constraint
        food_logs_fat_check
    check
    (
        fat_g >= 0
    ),

    constraint
        food_logs_estimation_confidence_check
    check
    (
        estimation_confidence is null
        or estimation_confidence in ('high', 'medium', 'low')
    )
);

-- =========================================================
-- INDEXES
-- =========================================================

create index if not exists
food_logs_user_date_idx
on public.food_logs
(user_id, log_date desc);

-- =========================================================
-- UPDATED AT
-- =========================================================

create or replace function
public.set_food_logs_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.updated_at =
        now();

    return new;
end;
$$;

drop trigger if exists
food_logs_updated_at
on public.food_logs;

create trigger
food_logs_updated_at
before update
on public.food_logs
for each row
execute function
public.set_food_logs_updated_at();

-- =========================================================
-- RLS
-- =========================================================

alter table
public.food_logs
enable row level security;

drop policy if exists
"food_logs_select_own"
on public.food_logs;

create policy
"food_logs_select_own"
on public.food_logs
for select
using
(
    auth.uid() =
    user_id
);

drop policy if exists
"food_logs_insert_own"
on public.food_logs;

create policy
"food_logs_insert_own"
on public.food_logs
for insert
with check
(
    auth.uid() =
    user_id
);

drop policy if exists
"food_logs_update_own"
on public.food_logs;

create policy
"food_logs_update_own"
on public.food_logs
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
"food_logs_delete_own"
on public.food_logs;

create policy
"food_logs_delete_own"
on public.food_logs
for delete
using
(
    auth.uid() =
    user_id
);
