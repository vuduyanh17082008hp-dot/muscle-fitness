-- Security closure 2026-11-03 (applied to hosted together with 20261022120100 / 20261022120200 / 20261008090000 as
-- migration "security_closure_conversations_role_tool_actions"). TRUNCATE ignores RLS; no client path needs it on
-- profiles (nor REFERENCES / TRIGGER). Same treatment 20261022120100 gives ai_threads / ai_messages.
revoke truncate, references, trigger on public.profiles from anon, authenticated;
