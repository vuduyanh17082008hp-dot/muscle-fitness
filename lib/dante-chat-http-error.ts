export const DANTE_UNAVAILABLE_MESSAGE =
  "Dante couldn't complete that response.\n\nYour logged data has not been changed.";

export const DANTE_SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Sign in again to continue with Dante.";

export const DANTE_RATE_LIMITED_MESSAGE =
  "You're sending messages a little too quickly.";

export function danteHttpFailureCopy(
  status: number,
  retryAfterSeconds?: number,
): string {
  if (status === 401) {
    return DANTE_SESSION_EXPIRED_MESSAGE;
  }

  if (status === 429) {
    const retryAfter =
      typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds
        : 0;
    return retryAfter > 0
      ? `${DANTE_RATE_LIMITED_MESSAGE} Try again in ${Math.ceil(retryAfter)} seconds.`
      : `${DANTE_RATE_LIMITED_MESSAGE} Try again shortly.`;
  }

  return DANTE_UNAVAILABLE_MESSAGE;
}

export function isDanteRateLimitedMessage(message: string): boolean {
  return message.startsWith(DANTE_RATE_LIMITED_MESSAGE);
}
