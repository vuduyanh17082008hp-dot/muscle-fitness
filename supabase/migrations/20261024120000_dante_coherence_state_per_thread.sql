-- S0 D-04: Dante coherence state is per conversation, not per user. One row per user let a language switch or an
-- unresolved safety episode from one chat leak into every new chat. The row is now keyed by (user_id, thread_key).
-- thread_key is the client-owned ai_threads id as text; '' is the legacy / threadless key (existing rows keep it, so
-- a request without a thread id behaves exactly as before). RLS is unchanged: every policy is already owner-only.
-- Do not auto-apply in production without review.

alter table public.dante_coherence_state add column if not exists thread_key text not null default ''
  check (char_length(thread_key) <= 64);

alter table public.dante_coherence_state drop constraint if exists dante_coherence_state_pkey;
alter table public.dante_coherence_state add constraint dante_coherence_state_pkey primary key (user_id, thread_key);
