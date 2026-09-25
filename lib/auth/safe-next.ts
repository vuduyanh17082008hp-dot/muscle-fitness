/** Shared by browser login and server callbacks. Never accept an external redirect. */
export function getSafeNext(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u0020\u007f]/.test(value)
  ) {
    return fallback;
  }

  // URL parsers treat backslashes and control characters specially.
  const origin = "https://muscle-fitness.invalid";
  try {
    if (new URL(value, origin).origin !== origin) return fallback;
  } catch {
    return fallback;
  }

  // Training and onboarding are valid destinations; their own routes enforce auth.
  // /settings is a stale alias — send post-login traffic to the canonical page.
  if (value === "/settings") {
    return "/dashboard/settings";
  }

  return value;
}
