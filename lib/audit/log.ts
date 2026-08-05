import "server-only"

import { createClient } from "@/lib/supabase/server"

type AuditMetadata = Record<string, unknown>

export type WriteAuditLogInput = {
  action: string
  entityType: string
  entityId?: string | null
  metadata?: AuditMetadata
}

export type WriteAuditLogResult =
  | {
      success: true
      id: string | null
    }
  | {
      success: false
      message: string
    }

export async function writeAuditLog(
  input: WriteAuditLogInput,
): Promise<WriteAuditLogResult> {
  const action = input.action.trim()
  const entityType = input.entityType.trim()

  if (!action || !entityType) {
    return {
      success: false,
      message: "Audit action and entity type are required.",
    }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    "write_audit_log",
    {
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: input.entityId ?? null,
      p_metadata: input.metadata ?? {},
    },
  )

  if (error) {
    return {
      success: false,
      message: error.message,
    }
  }

  return {
    success: true,
    id: typeof data === "string" ? data : null,
  }
}
