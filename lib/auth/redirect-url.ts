/* =========================================================
   AUTH REDIRECT URL HELPERS

   Goal:
   - Production auth emails always return to the stable
     production URL.
   - Local development can still use localhost.
   - No hard-coded old Vercel deployment URL.
========================================================= */

function removeTrailingSlash(
  value: string,
): string {
  return value.replace(
    /\/+$/,
    "",
  );
}

/* =========================================================
   SITE ORIGIN
========================================================= */

export function getSiteOrigin():
  string {
  /*
   * Local development should remain local.
   */
  if (
    typeof window !==
    "undefined"
  ) {
    const hostname =
      window.location.hostname;

    const isLocal =
      hostname ===
        "localhost" ||
      hostname ===
        "127.0.0.1";

    if (isLocal) {
      return removeTrailingSlash(
        window.location.origin,
      );
    }
  }

  /*
   * Production should use ONE stable URL configured
   * in Vercel:
   *
   * NEXT_PUBLIC_SITE_URL=https://your-domain.vercel.app
   */
  const configuredSiteUrl =
    process.env
      .NEXT_PUBLIC_SITE_URL
      ?.trim();

  if (configuredSiteUrl) {
    try {
      const parsed =
        new URL(
          configuredSiteUrl,
        );

      if (
        parsed.protocol ===
          "https:" ||
        parsed.protocol ===
          "http:"
      ) {
        return removeTrailingSlash(
          parsed.origin,
        );
      }
    } catch {
      console.error(
        "[AUTH] NEXT_PUBLIC_SITE_URL is invalid:",
        configuredSiteUrl,
      );
    }
  }

  /*
   * Final browser fallback.

   * This is useful for preview deployments but production
   * should always configure NEXT_PUBLIC_SITE_URL.
   */
  if (
    typeof window !==
    "undefined"
  ) {
    return removeTrailingSlash(
      window.location.origin,
    );
  }

  /*
   * Safe server fallback for development.
   */
  return "http://localhost:3000";
}

/* =========================================================
   AUTH CALLBACK
========================================================= */

export function getAuthCallbackUrl(
  next: string =
    "/dashboard",
): string {
  const origin =
    getSiteOrigin();

  const callbackUrl =
    new URL(
      "/auth/callback",
      origin,
    );

  /*
   * Only internal redirect destinations are allowed.
   */
  const safeNext =
    next.startsWith("/") &&
    !next.startsWith("//")
      ? next
      : "/dashboard";

  callbackUrl.searchParams.set(
    "next",
    safeNext,
  );

  return callbackUrl.toString();
}