-- Provider decommission: canonical provider for new AI audit records is OpenAI.
-- Existing audit records retain their historical provider value.

alter table public.ai_audit_logs
  alter column provider set default 'openai';
