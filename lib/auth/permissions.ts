import "server-only"

import { redirect } from "next/navigation"

import { writeAuditLog } from "@/lib/audit/log"
import {
  ADMIN_ROLES,
  STAFF_ROLES,
  hasAnyRole,
  isAppRole,
  isSuperAdminRole,
  normalizeAppRole,
  type ActiveAppRole,
  type AppRole,
} from "@/lib/auth/roles"
import { createClient } from "@/lib/supabase/server"

export type AuthenticatedActor = {
  userId: string
  role: AppRole
  effectiveRole: ActiveAppRole
}

async function resolveActorRole(
  userId: string,
): Promise<AppRole> {
  const supabase = await createClient()

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle()

  if (isAppRole(roleRow?.role)) {
    return roleRow.role
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle()

  if (isAppRole(profileRow?.role)) {
    return profileRow.role
  }

  return "client"
}

export async function getAuthenticatedActor(): Promise<AuthenticatedActor | null> {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  const role = await resolveActorRole(user.id)

  return {
    userId: user.id,
    role,
    effectiveRole: normalizeAppRole(role),
  }
}

export async function requireAuthenticatedActor(): Promise<AuthenticatedActor> {
  const actor = await getAuthenticatedActor()

  if (!actor) {
    redirect("/login?next=/dashboard")
  }

  return actor
}

export async function requireRole(
  requiredRoles: readonly ActiveAppRole[],
  nextPath = "/unauthorized",
): Promise<AuthenticatedActor> {
  const actor = await requireAuthenticatedActor()

  if (!hasAnyRole(actor.role, requiredRoles)) {
    redirect(nextPath)
  }

  return actor
}

export async function requireStaff(
  nextPath = "/unauthorized",
): Promise<AuthenticatedActor> {
  return requireRole(STAFF_ROLES, nextPath)
}

export async function requireAdmin(
  nextPath = "/unauthorized",
): Promise<AuthenticatedActor> {
  return requireRole(ADMIN_ROLES, nextPath)
}

export async function requireSuperAdmin(
  nextPath = "/unauthorized",
): Promise<AuthenticatedActor> {
  const actor = await requireAuthenticatedActor()

  if (!isSuperAdminRole(actor.role)) {
    redirect(nextPath)
  }

  return actor
}

export async function assertIsAdmin(): Promise<boolean> {
  const actor = await getAuthenticatedActor()

  if (!actor) {
    return false
  }

  return hasAnyRole(actor.role, ADMIN_ROLES)
}

export async function setUserRoleWithAudit(input: {
  targetUserId: string
  role: AppRole
}): Promise<{ success: true } | { success: false; message: string }> {
  const actor = await getAuthenticatedActor()

  if (!actor || !hasAnyRole(actor.role, ADMIN_ROLES)) {
    return {
      success: false,
      message: "Administrator access required.",
    }
  }

  if (
    input.role === "super_admin" &&
    !isSuperAdminRole(actor.role)
  ) {
    return {
      success: false,
      message: "Only a super admin can assign super_admin.",
    }
  }

  const supabase = await createClient()

  const { error } = await supabase.from("user_roles").upsert(
    {
      user_id: input.targetUserId,
      role: input.role,
      created_by: actor.userId,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    },
  )

  if (error) {
    return {
      success: false,
      message: error.message,
    }
  }

  await writeAuditLog({
    action: "role.updated",
    entityType: "user_roles",
    entityId: input.targetUserId,
    metadata: {
      role: input.role,
      actorId: actor.userId,
    },
  })

  return { success: true }
}
