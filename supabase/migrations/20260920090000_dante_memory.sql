-- =========================================================
-- MUSCLE FITNESS
-- DANTE MEMORY — structured, user-controlled preference layer
--
-- Deliberately NOT a free-form notes/JSON blob Dante can write to
-- unsupervised: every column is a specific, typed field the user
-- themselves views, edits and deletes via a real settings UI
-- (app/api/dante/memory/route.ts). Dante reads this table; it does
-- not write to it on its own.
--
-- One row per user (user_id is the primary key) rather than a
-- key/value table — there is a small, fixed set of fields, so a
-- normal row is simpler and easier to inspect than a generic store.
-- =========================================================

create table if not exists
public.dante_memory
(
    user_id uuid primary key
        references auth.users(id)
        on delete cascade,

    -- Free-text exercise names, matched loosely against the exercise
    -- library by the UI — not a foreign key, since a user may name a
    -- preference/dislike before that exact exercise is logged.
    preferred_exercises text[]
        not null
        default '{}',

    disliked_exercises text[]
        not null
        default '{}',

    -- Canonical muscle ids (lib/training/muscle-taxonomy.ts), so this
    -- can be cross-referenced against real training-volume data
    -- rather than being purely descriptive.
    weak_point_priorities text[]
        not null
        default '{}',

    coaching_preference text,

    updated_at timestamptz
        not null
        default now(),

    constraint
        dante_memory_coaching_preference_check
    check
    (
        coaching_preference is null
        or coaching_preference in
        ('direct', 'encouraging', 'detailed', 'concise')
    )
);

alter table
public.dante_memory
enable row level security;

drop policy if exists
"dante_memory_select_own"
on public.dante_memory;

create policy
"dante_memory_select_own"
on public.dante_memory
for select
using
(
    auth.uid() =
    user_id
);

drop policy if exists
"dante_memory_insert_own"
on public.dante_memory;

create policy
"dante_memory_insert_own"
on public.dante_memory
for insert
with check
(
    auth.uid() =
    user_id
);

drop policy if exists
"dante_memory_update_own"
on public.dante_memory;

create policy
"dante_memory_update_own"
on public.dante_memory
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
"dante_memory_delete_own"
on public.dante_memory;

create policy
"dante_memory_delete_own"
on public.dante_memory
for delete
using
(
    auth.uid() =
    user_id
);
