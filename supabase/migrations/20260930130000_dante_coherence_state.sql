-- Dante Phase 2 — durable conversation-coherence state (one VersionedState per user).
-- Holds only structured Phase 2 state: corrections/boundaries as enumerated statements, commitments,
-- open loops, language/address/verbosity, safety lifecycle, and hashed response/advice signatures.
-- It stores no raw chat text. Chat history remains supporting evidence only.
--
-- Writes are compare-and-swap on state_version (UPDATE ... WHERE state_version = <expected>), so a stale
-- request can never overwrite a newer state. Do not auto-apply in production without review.

create table if not exists public.dante_coherence_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state_version integer not null check (state_version >= 0),
  schema_version integer not null default 1,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.dante_coherence_state enable row level security;

create policy "dante_coherence_select_own" on public.dante_coherence_state
  for select using (auth.uid() = user_id);

create policy "dante_coherence_insert_own" on public.dante_coherence_state
  for insert with check (auth.uid() = user_id);

create policy "dante_coherence_update_own" on public.dante_coherence_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "dante_coherence_delete_own" on public.dante_coherence_state
  for delete using (auth.uid() = user_id);
