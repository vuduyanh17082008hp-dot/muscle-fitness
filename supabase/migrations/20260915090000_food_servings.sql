-- =========================================================
-- MUSCLE FITNESS
-- NUTRITION TRACKING — PORTION / SERVING SYSTEM
--
-- Extends the existing food_logs table (never duplicated) with how
-- a portion was actually expressed (grams vs a named serving), and
-- adds a small per-user table of remembered serving definitions
-- ("1 scoop = 30 g") that a user can define once and reuse forever.
-- =========================================================

begin;

-- =========================================================
-- FOOD_LOGS — remember HOW the quantity was entered
-- =========================================================

alter table public.food_logs
  add column if not exists serving_name text,
  add column if not exists servings_consumed numeric(6,2);

alter table public.food_logs
  add constraint food_logs_servings_consumed_check
  check (servings_consumed is null or servings_consumed > 0);

-- =========================================================
-- USER_FOOD_SERVINGS — per-user remembered serving definitions
-- =========================================================

create table if not exists
public.user_food_servings
(
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid
        not null
        references auth.users(id)
        on delete cascade,

    -- Stable food identity: "barcode:<code>" or "<source>:<sourceId>".
    -- Computed the same way everywhere by
    -- lib/nutrition/food-identity.ts — never matched by display name
    -- alone when a stronger identifier exists.
    food_identity text
        not null,

    food_name text
        not null,

    serving_name text
        not null,

    serving_grams numeric(8,2)
        not null,

    created_at timestamptz
        not null
        default now(),

    updated_at timestamptz
        not null
        default now(),

    constraint
        user_food_servings_unique
    unique
        (user_id, food_identity, serving_name),

    constraint
        user_food_servings_grams_check
    check
    (
        serving_grams > 0
    )
);

create index if not exists
user_food_servings_user_identity_idx
on public.user_food_servings
(user_id, food_identity);

create or replace function
public.set_user_food_servings_updated_at()
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
user_food_servings_updated_at
on public.user_food_servings;

create trigger
user_food_servings_updated_at
before update
on public.user_food_servings
for each row
execute function
public.set_user_food_servings_updated_at();

-- =========================================================
-- RLS
-- =========================================================

alter table
public.user_food_servings
enable row level security;

drop policy if exists
"user_food_servings_select_own"
on public.user_food_servings;

create policy
"user_food_servings_select_own"
on public.user_food_servings
for select
using
(
    auth.uid() =
    user_id
);

drop policy if exists
"user_food_servings_insert_own"
on public.user_food_servings;

create policy
"user_food_servings_insert_own"
on public.user_food_servings
for insert
with check
(
    auth.uid() =
    user_id
);

drop policy if exists
"user_food_servings_update_own"
on public.user_food_servings;

create policy
"user_food_servings_update_own"
on public.user_food_servings
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
"user_food_servings_delete_own"
on public.user_food_servings;

create policy
"user_food_servings_delete_own"
on public.user_food_servings
for delete
using
(
    auth.uid() =
    user_id
);

commit;
