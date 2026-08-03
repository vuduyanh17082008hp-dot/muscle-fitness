export function getSafeNext(
  value: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!value) {
    return fallback
  }

  if (
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return fallback
  }

  /*
   * Không cho login redirect trực tiếp đến
   * các trang onboarding hoặc training do link cũ.
   */
  const blockedRoutes = [
    "/training",
    "/onboarding",
    "/onboarding-backup",
    "/profile-setup",
  ]

  const isBlocked = blockedRoutes.some(
    (route) =>
      value === route ||
      value.startsWith(`${route}?`) ||
      value.startsWith(`${route}/`)
  )

  if (isBlocked) {
    return fallback
  }

  return value
}