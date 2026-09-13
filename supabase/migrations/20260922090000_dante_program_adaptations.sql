-- Adaptive Program Engine audit trail (spec Part "4. ADAPTIVE PROGRAM
-- ENGINE": "Store why the adaptation happened"). Append-only history —
-- no update policy, since a past adaptation's reasoning should never
-- be edited after the fact.

create table if not exists public.dante_program_adaptations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null,
  exercise_name text not null,
  action text not null check (action in ('INCREASE_LOAD', 'HOLD', 'DECREASE_LOAD')),
  suggested_weight_kg numeric(6, 2),
  reason text not null,
  gated boolean not null default false,
  confidence text not null check (confidence in ('low', 'moderate', 'high')),
  evidence_sample_size integer not null,
  created_at timestamptz not null default now()
);

create index if not exists dante_program_adaptations_user_created_idx
  on public.dante_program_adaptations (user_id, created_at desc);

alter table public.dante_program_adaptations enable row level security;

create policy "select_own" on public.dante_program_adaptations
  for select using (auth.uid() = user_id);

create policy "insert_own" on public.dante_program_adaptations
  for insert with check (auth.uid() = user_id);
