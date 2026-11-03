-- user_roles is the only role authority (20261022120200). Its RLS allows clients SELECT only, but the
-- hosted project still granted anon/authenticated TRUNCATE, which ignores RLS. No client path needs
-- TRUNCATE / REFERENCES / TRIGGER here; same treatment 20261103130000 gives profiles.
revoke truncate, references, trigger on public.user_roles from anon, authenticated;
