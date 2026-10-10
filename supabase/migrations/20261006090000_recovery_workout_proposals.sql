-- Additive store for Recovery workout-adjustment snapshots.
-- Preview writes the canonical proposal; apply loads this row and
-- ignores client prescription fields. Do not apply to hosted
-- production from this task.
-- Owner-scoped RLS. Insert-once: unique proposal_id, no UPDATE/DELETE.

create table if not exists
public.recovery_workout_proposals
(
    proposal_id text primary key,

    user_id uuid
        not null
        references auth.users(id)
        on delete cascade,

    workout_ref text
        not null,

    plan_version_ref text
        not null,

    expires_at timestamptz
        not null,

    snapshot jsonb
        not null,

    issuance_mac text
        not null,

    created_at timestamptz
        not null
        default now()
);

create index if not exists
recovery_workout_proposals_user_created_idx
on public.recovery_workout_proposals
(user_id, created_at desc);

alter table public.recovery_workout_proposals
enable row level security;

drop policy if exists "recovery_workout_proposals_select_own"
on public.recovery_workout_proposals;

drop policy if exists "recovery_workout_proposals_insert_own"
on public.recovery_workout_proposals;

drop policy if exists "recovery_workout_proposals_update_own"
on public.recovery_workout_proposals;

-- Browser JWT: no table access. Server service_role inserts and reads.
revoke all on table public.recovery_workout_proposals from public, anon, authenticated;
grant select, insert
on table public.recovery_workout_proposals
to service_role;
