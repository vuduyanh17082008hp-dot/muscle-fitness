import "server-only"

import type { AiAuditEntry } from "@/lib/business/types"

/**
 * In-process AI audit trail.
 *
 * Every AI call the business platform makes is recorded here and rendered
 * on /business/responsible-ai. This is intentionally an in-memory ring
 * buffer for the demo: the real integration point is the `ai_audit_logs`
 * table created by supabase/migrations/*_muscle_ai_business.sql, which
 * `recordAiAudit` should write to once an organisation is provisioned.
 */

const MAX_ENTRIES = 40

const SEED_ENTRIES: AiAuditEntry[] = [
  {
    id: "audit-seed-3",
    timestamp: "2026-09-08T09:12:00.000Z",
    feature: "business-insights",
    model: "openai/gpt-oss-120b (Groq)",
    action: "Generated 3 weekly business insights from aggregate statistics",
    humanApproval: "not-required",
  },
  {
    id: "audit-seed-2",
    timestamp: "2026-09-07T16:40:00.000Z",
    feature: "campaign-generation",
    model: "openai/gpt-oss-120b (Groq)",
    action: "Drafted campaign copy for segment: casual members",
    humanApproval: "required",
  },
  {
    id: "audit-seed-1",
    timestamp: "2026-09-07T11:05:00.000Z",
    feature: "member-analysis",
    model: "openai/gpt-oss-120b (Groq)",
    action: "Explained churn risk factors for 1 member",
    humanApproval: "not-required",
  },
]

const entries: AiAuditEntry[] = [...SEED_ENTRIES]

export function recordAiAudit(input: {
  feature: string
  model: string
  action: string
  humanApproval: AiAuditEntry["humanApproval"]
}): void {
  entries.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    feature: input.feature,
    model: input.model,
    action: input.action,
    humanApproval: input.humanApproval,
  })

  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES
  }
}

export function getAiAuditEntries(): AiAuditEntry[] {
  return [...entries]
}
