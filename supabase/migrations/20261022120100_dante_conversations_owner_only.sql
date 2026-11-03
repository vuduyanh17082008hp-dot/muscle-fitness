-- Dante conversations are private to their owner. The 20260805180100
-- policies (kept by 20261021120000) also let is_admin() read, rewrite and
-- delete every user's threads and messages through an ordinary session.
-- No application path uses that: the only reader/writer is
-- lib/dante-core/conversation-store.ts with the user's own session, and the
-- service role bypasses RLS anyway. Sibling tables (dante_memory,
-- dante_coherence_state, dante_tool_actions, coach_signals) are already
-- owner-only. Support access, if ever needed, is a separate audited path.

drop policy if exists ai_threads_own on public.ai_threads;
create policy ai_threads_own
on public.ai_threads
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists ai_messages_own on public.ai_messages;
create policy ai_messages_own
on public.ai_messages
for all
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.ai_threads t
    where t.id = thread_id and t.user_id = (select auth.uid())
  )
);

-- TRUNCATE ignores RLS; nothing client-side needs it (nor REFERENCES/TRIGGER).
revoke truncate, references, trigger on public.ai_threads, public.ai_messages from anon, authenticated;
