-- Additive audit log for user-confirmed workout adjustments.
-- Do not apply to hosted production from this task.
-- Owner-scoped RLS only. Unique proposal_id makes apply idempotent.

create table if not exists
public.workout_mutation_records
(
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid
        not null
        references auth.users(id)
        on delete cascade,

    proposal_id text
        not null,

    workout_before_ref text
        not null,

    workout_after_ref text
        not null,

    previous_plan_version_ref text
        not null,

    new_plan_version_ref text
        not null,

    applied_at timestamptz
        not null
        default now(),

    applied_by text
        not null
        default 'USER_CONFIRMED_DANTE_PROPOSAL',

    change_refs text[]
        not null
        default '{}',

    constraint workout_mutation_records_proposal_unique
        unique (proposal_id),

    constraint workout_mutation_records_applied_by_check
        check (applied_by = 'USER_CONFIRMED_DANTE_PROPOSAL')
);

create index if not exists
workout_mutation_records_user_applied_idx
on public.workout_mutation_records
(user_id, applied_at desc);

alter table public.workout_mutation_records
enable row level security;

drop policy if exists "workout_mutation_records_select_own"
on public.workout_mutation_records;

create policy "workout_mutation_records_select_own"
on public.workout_mutation_records
for select
using (auth.uid() = user_id);

drop policy if exists "workout_mutation_records_insert_own"
on public.workout_mutation_records;

create policy "workout_mutation_records_insert_own"
on public.workout_mutation_records
for insert
with check (auth.uid() = user_id);
