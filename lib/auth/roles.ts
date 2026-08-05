/**
 * Muscle Fitness V2
 * Central role definitions and role helper functions.
 *
 * Important:
 * - "user" is the legacy V1 role.
 * - V2 converts "user" into "client".
 * - This file intentionally does not depend on database.types.ts,
 *   so stale generated Supabase types cannot break the application.
 */

export const LEGACY_APP_ROLES = ["user"] as const

export const ACTIVE_APP_ROLES = [
  "client",
  "coach",
  "support",
  "admin",
  "super_admin",
] as const

export const APP_ROLES = [
  ...LEGACY_APP_ROLES,
  ...ACTIVE_APP_ROLES,
] as const

export const STAFF_ROLES = [
  "coach",
  "support",
  "admin",
  "super_admin",
] as const

export const ADMIN_ROLES = [
  "admin",
  "super_admin",
] as const

export type LegacyAppRole =
  (typeof LEGACY_APP_ROLES)[number]

export type ActiveAppRole =
  (typeof ACTIVE_APP_ROLES)[number]

export type AppRole =
  (typeof APP_ROLES)[number]

/**
 * Compatibility aliases.
 */
export type RoleName = AppRole
export type NormalizedAppRole = ActiveAppRole
export type DatabaseAppRole = AppRole

export const DEFAULT_APP_ROLE: ActiveAppRole = "client"

export type AppRoleConfig = {
  value: ActiveAppRole
  label: string
  shortLabel: string
  description: string
  dashboardPath: string
  isStaff: boolean
  isAdmin: boolean
}

export const APP_ROLE_CONFIG = {
  client: {
    value: "client",
    label: "Client",
    shortLabel: "Client",
    description:
      "Access personal workouts, nutrition, progress and coaching features.",
    dashboardPath: "/dashboard",
    isStaff: false,
    isAdmin: false,
  },

  coach: {
    value: "coach",
    label: "Coach",
    shortLabel: "Coach",
    description:
      "Manage assigned clients, coaching plans, check-ins and messages.",
    dashboardPath: "/coach",
    isStaff: true,
    isAdmin: false,
  },

  support: {
    value: "support",
    label: "Support",
    shortLabel: "Support",
    description:
      "Manage support tickets, product feedback and user assistance.",
    dashboardPath: "/support",
    isStaff: true,
    isAdmin: false,
  },

  admin: {
    value: "admin",
    label: "Administrator",
    shortLabel: "Admin",
    description:
      "Manage users, roles, subscriptions and platform configuration.",
    dashboardPath: "/admin",
    isStaff: true,
    isAdmin: true,
  },

  super_admin: {
    value: "super_admin",
    label: "Super Administrator",
    shortLabel: "Super Admin",
    description:
      "Full platform access, including administrator role management.",
    dashboardPath: "/admin",
    isStaff: true,
    isAdmin: true,
  },
} as const satisfies Readonly<
  Record<ActiveAppRole, AppRoleConfig>
>

/**
 * Compatibility maps for components that access role data directly.
 */
export const ROLE_LABELS: Readonly<
  Record<ActiveAppRole, string>
> = {
  client: APP_ROLE_CONFIG.client.label,
  coach: APP_ROLE_CONFIG.coach.label,
  support: APP_ROLE_CONFIG.support.label,
  admin: APP_ROLE_CONFIG.admin.label,
  super_admin: APP_ROLE_CONFIG.super_admin.label,
}

export const ROLE_DESCRIPTIONS: Readonly<
  Record<ActiveAppRole, string>
> = {
  client: APP_ROLE_CONFIG.client.description,
  coach: APP_ROLE_CONFIG.coach.description,
  support: APP_ROLE_CONFIG.support.description,
  admin: APP_ROLE_CONFIG.admin.description,
  super_admin: APP_ROLE_CONFIG.super_admin.description,
}

export const ROLE_HOME_ROUTES: Readonly<
  Record<ActiveAppRole, string>
> = {
  client: APP_ROLE_CONFIG.client.dashboardPath,
  coach: APP_ROLE_CONFIG.coach.dashboardPath,
  support: APP_ROLE_CONFIG.support.dashboardPath,
  admin: APP_ROLE_CONFIG.admin.dashboardPath,
  super_admin: APP_ROLE_CONFIG.super_admin.dashboardPath,
}

/**
 * Options for role dropdowns.
 *
 * Super admin is intentionally included here.
 * Filter it from the UI when the current user is not a super admin.
 */
export const APP_ROLE_OPTIONS = ACTIVE_APP_ROLES.map(
  (role) => ({
    value: role,
    label: APP_ROLE_CONFIG[role].label,
    description: APP_ROLE_CONFIG[role].description,
  }),
)

/**
 * Check whether an unknown value is a legacy role.
 */
export function isLegacyAppRole(
  value: unknown,
): value is LegacyAppRole {
  return (
    typeof value === "string" &&
    (
      LEGACY_APP_ROLES as readonly string[]
    ).includes(value)
  )
}

/**
 * Check whether an unknown value is an active V2 role.
 */
export function isActiveAppRole(
  value: unknown,
): value is ActiveAppRole {
  return (
    typeof value === "string" &&
    (
      ACTIVE_APP_ROLES as readonly string[]
    ).includes(value)
  )
}

/**
 * Check whether an unknown value is any recognised role.
 */
export function isAppRole(
  value: unknown,
): value is AppRole {
  return (
    typeof value === "string" &&
    (APP_ROLES as readonly string[]).includes(value)
  )
}

/**
 * Convert database or legacy role values into the active V2 role model.
 *
 * V1:
 * user
 *
 * V2:
 * client
 */
export function normalizeAppRole(
  role: unknown,
): ActiveAppRole {
  if (role === "user") {
    return "client"
  }

  if (isActiveAppRole(role)) {
    return role
  }

  return DEFAULT_APP_ROLE
}

/**
 * Returns the complete role configuration.
 */
export function getAppRoleConfig(
  role: unknown,
): AppRoleConfig {
  const normalizedRole = normalizeAppRole(role)

  return APP_ROLE_CONFIG[normalizedRole]
}

/**
 * Returns the human-readable role label.
 */
export function getAppRoleLabel(
  role: unknown,
): string {
  return getAppRoleConfig(role).label
}

/**
 * Returns the shorter role label.
 */
export function getAppRoleShortLabel(
  role: unknown,
): string {
  return getAppRoleConfig(role).shortLabel
}

/**
 * Returns the human-readable role description.
 */
export function getAppRoleDescription(
  role: unknown,
): string {
  return getAppRoleConfig(role).description
}

/**
 * Returns the default dashboard route for a role.
 */
export function getRoleHomeRoute(
  role: unknown,
): string {
  return getAppRoleConfig(role).dashboardPath
}

/**
 * Compatibility alias used by older components.
 */
export function getDefaultRouteForRole(
  role: unknown,
): string {
  return getRoleHomeRoute(role)
}

/**
 * True when the supplied role represents a client.
 *
 * Legacy "user" also counts as client.
 */
export function isClientRole(
  role: unknown,
): boolean {
  return normalizeAppRole(role) === "client"
}

/**
 * True only for a coach.
 */
export function isCoachRole(
  role: unknown,
): boolean {
  return normalizeAppRole(role) === "coach"
}

/**
 * True only for support staff.
 */
export function isSupportRole(
  role: unknown,
): boolean {
  return normalizeAppRole(role) === "support"
}

/**
 * True for coach, support, admin or super admin.
 */
export function isStaffRole(
  role: unknown,
): boolean {
  if (!isAppRole(role)) {
    return false
  }

  const normalizedRole = normalizeAppRole(role)

  return (
    STAFF_ROLES as readonly ActiveAppRole[]
  ).includes(normalizedRole)
}

/**
 * True for admin or super admin.
 */
export function isAdminRole(
  role: unknown,
): boolean {
  if (!isAppRole(role)) {
    return false
  }

  const normalizedRole = normalizeAppRole(role)

  return (
    ADMIN_ROLES as readonly ActiveAppRole[]
  ).includes(normalizedRole)
}

/**
 * True only for super admin.
 */
export function isSuperAdminRole(
  role: unknown,
): boolean {
  return normalizeAppRole(role) === "super_admin"
}

/**
 * A coach can access coach tools.
 * Admins also have access for oversight.
 */
export function canAccessCoachArea(
  role: unknown,
): boolean {
  const normalizedRole = normalizeAppRole(role)

  return (
    normalizedRole === "coach" ||
    normalizedRole === "admin" ||
    normalizedRole === "super_admin"
  )
}

/**
 * Support, admin and super admin can access support tools.
 */
export function canAccessSupportArea(
  role: unknown,
): boolean {
  const normalizedRole = normalizeAppRole(role)

  return (
    normalizedRole === "support" ||
    normalizedRole === "admin" ||
    normalizedRole === "super_admin"
  )
}

/**
 * Admin and super admin can access the admin area.
 */
export function canAccessAdminArea(
  role: unknown,
): boolean {
  return isAdminRole(role)
}

/**
 * Only super admin can assign or remove the super_admin role.
 */
export function canManageSuperAdminRole(
  role: unknown,
): boolean {
  return isSuperAdminRole(role)
}

/**
 * Check whether a role is included in an allowed role list.
 */
export function hasAnyRole(
  role: unknown,
  allowedRoles: readonly ActiveAppRole[],
): boolean {
  if (!isAppRole(role)) {
    return false
  }

  const normalizedRole = normalizeAppRole(role)

  return allowedRoles.includes(normalizedRole)
}

/**
 * Safely parse a role.
 *
 * Returns null instead of silently converting an invalid value.
 */
export function parseAppRole(
  role: unknown,
): ActiveAppRole | null {
  if (!isAppRole(role)) {
    return null
  }

  return normalizeAppRole(role)
}

/**
 * Parse a role and throw when it is invalid.
 */
export function requireValidAppRole(
  role: unknown,
): ActiveAppRole {
  const parsedRole = parseAppRole(role)

  if (!parsedRole) {
    throw new Error("Invalid application role.")
  }

  return parsedRole
}