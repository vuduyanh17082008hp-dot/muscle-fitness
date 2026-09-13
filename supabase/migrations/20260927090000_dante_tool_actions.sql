-- =========================================================
-- MUSCLE FITNESS
-- DANTE TOOL ACTIONS — the pending-action model for Dante's typed
-- tool registry (Agentic Performance Interface, Part 8).
--
-- Distinct from public.dante_action_log (20260921090000_dante_actions.sql):
-- that table audits actions the DETERMINISTIC DECISION ENGINES propose
-- (adjust_sets_reps, modify_volume, ...), a fixed typed union. This
-- table is the confirm/cancel/expire lifecycle for a Dante TOOL CALL
-- proposed during a chat turn (log_food, schedule_workout, ...) — a
-- different, open-ended set of tool names (Part 21: new tools register
-- without a schema change), so it gets its own table rather than
-- widening dante_action_log's CHECK constraint for an unrelated concern.
--
-- No LLM ever writes a row here directly — only
-- lib/dante-core/tools/pending-actions.ts, always scoped to the
-- authenticated caller (Part 17).
-- =========================================================

create table if not exists
public.dante_tool_actions
(
    id uuid primary key
        default gen_random_uuid(),

    user_id uuid
        not null
        references auth.users(id)
        on delete cascade,

    tool_name text
        not null,

    status text
        not null
        default 'pending',

    -- Validated input, exactly as it passed the tool's own zod schema
    -- at proposal time — never replaced by a later client request
    -- (Part 8: "validated args cannot be replaced by client after
    -- proposal"). The CONFIRM step re-reads this column, it never
    -- accepts a fresh args payload from the confirm request.
    args jsonb
        not null,

    -- Human-facing summary shown in the confirmation UI (Part 7).
    summary text
        not null,

    -- Set once status moves to 'executed' or 'failed'.
    result jsonb,

    created_at timestamptz
        not null
        default now(),

    -- Short expiration (Part 8) — a pending action can no longer be
    -- confirmed once this passes; enforced by the atomic claim query
    -- in pending-actions.ts, not by a background sweep.
    expires_at timestamptz
        not null
        default (now() + interval '10 minutes'),

    executed_at timestamptz,

    constraint
        dante_tool_actions_status_check
    check
    (
        status in
        ('pending', 'confirmed', 'executed', 'cancelled', 'expired', 'failed')
    )
);

create index if not exists
dante_tool_actions_user_created_idx
on public.dante_tool_actions
(user_id, created_at desc);

alter table
public.dante_tool_actions
enable row level security;

-- Every RLS policy below is scoped to auth.uid() = user_id, so a
-- caller can never read, confirm, or cancel another user's pending
-- action even before the application-layer check in
-- pending-actions.ts runs (Part 17: "another user's actionId ->
-- rejected" holds at the database layer too, not just in app code).

drop policy if exists
"dante_tool_actions_select_own"
on public.dante_tool_actions;

create policy
"dante_tool_actions_select_own"
on public.dante_tool_actions
for select
using
(
    auth.uid() =
    user_id
);

drop policy if exists
"dante_tool_actions_insert_own"
on public.dante_tool_actions;

create policy
"dante_tool_actions_insert_own"
on public.dante_tool_actions
for insert
with check
(
    auth.uid() =
    user_id
);

drop policy if exists
"dante_tool_actions_update_own"
on public.dante_tool_actions;

create policy
"dante_tool_actions_update_own"
on public.dante_tool_actions
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
