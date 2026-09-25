-- Dante N-of-1 micro-experiments (chat Proposal Engine V1 durability).
-- Distinct from public.experiments (Personal Experiment Lab catalog).
-- Persist ONLY after explicit user accept + tool confirmation.
-- Do not auto-apply in production without review.

create table if not exists public.dante_nof1_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hypothesis text not null,
  rationale text not null default '',
  controlled_variables jsonb not null default '[]'::jsonb,
  variable_under_test text not null,
  primary_outcome text not null,
  secondary_outcomes jsonb not null default '[]'::jsonb,
  experiment_window jsonb not null,
  confounders jsonb not null default '[]'::jsonb,
  status text not null
    check (status in (
      'PROPOSED',
      'ACCEPTED',
      'ACTIVE',
      'CONFOUNDED',
      'COMPLETED',
      'CANCELLED',
      'ABORTED'
    )),
  user_confirmed boolean not null default false,
  protocol_adherence text
    check (protocol_adherence is null or protocol_adherence in ('COMPLETE', 'PARTIAL', 'POOR')),
  conclusion jsonb,
  template_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists dante_nof1_experiments_user_status_idx
  on public.dante_nof1_experiments (user_id, status, created_at desc);

alter table public.dante_nof1_experiments enable row level security;

create policy "dante_nof1_select_own" on public.dante_nof1_experiments
  for select using (auth.uid() = user_id);

create policy "dante_nof1_insert_own" on public.dante_nof1_experiments
  for insert with check (auth.uid() = user_id);

create policy "dante_nof1_update_own" on public.dante_nof1_experiments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "dante_nof1_delete_own" on public.dante_nof1_experiments
  for delete using (auth.uid() = user_id);
