-- Dante conversation persistence: reuse ai_threads / ai_messages (created in
-- 20260805180100, never written until now) instead of adding new tables.
--
-- client_message_id + the unique index make a retried turn idempotent (one
-- user row and one assistant row per client turn). status lets an assistant
-- row exist before its reply is confirmed, so a refresh mid-stream shows
-- "pending/interrupted" instead of a fake complete answer. metadata holds the
-- structured done-event fields needed to rebuild the UI (insight, sources,
-- proposal reference) — never tool traces or model reasoning.

alter table public.ai_messages
  add column if not exists client_message_id text,
  add column if not exists status text not null default 'complete',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.ai_messages
  drop constraint if exists ai_messages_status_check;
alter table public.ai_messages
  add constraint ai_messages_status_check
  check (status in ('pending', 'complete', 'error', 'interrupted'));

-- NULLs stay distinct, so legacy rows without a client id are unaffected.
create unique index if not exists ai_messages_thread_client_role_uidx
  on public.ai_messages (thread_id, client_message_id, role);

-- The original policy only checked the row's user_id, so a user could attach
-- a message to someone else's thread id. Writes must now target an own thread.
drop policy if exists ai_messages_own on public.ai_messages;
create policy ai_messages_own
on public.ai_messages
for all
to authenticated
using (user_id = (select auth.uid()) or public.is_admin())
with check (
  (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.ai_threads t
      where t.id = thread_id and t.user_id = (select auth.uid())
    )
  )
  or public.is_admin()
);
