import type { JwtPayload } from "@supabase/supabase-js";

/** How long after the recovery link was used the reset form stays open. */
export const RECOVERY_WINDOW_SECONDS = 15 * 60;

/**
 * True when the verified JWT was issued by a password-recovery link used
 * within the last RECOVERY_WINDOW_SECONDS.
 *
 * GoTrue signs the purpose into `amr`: the PKCE recovery exchange
 * (/auth/callback) records "recovery", a magic link "magiclink", a password
 * login "password". "otp" is not accepted — verifyOtp records it for every
 * emailed code or token_hash, login included, so it says how the user
 * authenticated, not why. The entry's signed timestamp is when the link was
 * used and bounds the window.
 */
export function isRecoverySession(
  claims: Pick<JwtPayload, "amr"> | null | undefined,
  nowSeconds = Date.now() / 1000,
): boolean {
  return (claims?.amr ?? []).some(
    (entry) =>
      typeof entry !== "string" &&
      entry.method === "recovery" &&
      nowSeconds - entry.timestamp <= RECOVERY_WINDOW_SECONDS,
  );
}
