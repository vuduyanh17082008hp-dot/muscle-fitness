-- =========================================================
-- MUSCLE FITNESS
-- DANTE ACTION LOG — audit trail for every proposed/confirmed/
-- rejected/applied Dante action.
--
-- Dante NEVER writes here directly from an LLM call — only the typed
-- apply-action flow (lib/dante-core/actions/apply-action.ts) inserts
-- rows, and only after the SAME server-side validation/ownership
-- checks used by the underlying mutation itself. This table exists
-- to make that flow inspectable after the fact, not to BE the
-- authorization mechanism.
-- =========================================================

create table if not exists
public.dante_action_log
(
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid
        not null
        references auth.users(id)
        on delete cascade,

    action_type text
        not null,

    status text
        not null,

    -- The full typed action payload (DanteActionPayload) as proposed —
    -- kept as jsonb since it's a discriminated union with a different
    -- shape per action_type, not because it's free-form.
    payload jsonb
        not null,

    reason text,

    decision_confidence numeric(4,3),

    -- Set only once status moves to 'applied' or 'failed' — the real
    -- result returned by the underlying mutation function.
    applied_result jsonb,

    created_at timestamptz
        not null
        default now(),

    updated_at timestamptz
        not null
        default now(),

    constraint
        dante_action_log_status_check
    check
    (
        status in
        ('proposed', 'confirmed', 'applied', 'rejected', 'failed')
    ),

    constraint
        dante_action_log_type_check
    check
    (
        action_type in (
            'adjust_sets_reps',
            'postpone_exercise',
            'modify_volume',
            'recovery_action',
            'macro_adjustment',
            'meal_suggestion'
        )
    )
);

create index if not exists
dante_action_log_user_created_idx
on public.dante_action_log
(user_id, created_at desc);

alter table
public.dante_action_log
enable row level security;

drop policy if exists
"dante_action_log_select_own"
on public.dante_action_log;

create policy
"dante_action_log_select_own"
on public.dante_action_log
for select
using
(
    auth.uid() =
    user_id
);

drop policy if exists
"dante_action_log_insert_own"
on public.dante_action_log;

create policy
"dante_action_log_insert_own"
on public.dante_action_log
for insert
with check
(
    auth.uid() =
    user_id
);

drop policy if exists
"dante_action_log_update_own"
on public.dante_action_log;

create policy
"dante_action_log_update_own"
on public.dante_action_log
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
