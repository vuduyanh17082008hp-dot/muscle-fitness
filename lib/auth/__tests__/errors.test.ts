import { describe, expect, it } from "vitest";
import { getFriendlyAuthError } from "@/lib/auth/errors";

// Every auth screen (login, register, reset, resend) is English-only (<html lang="en">).
const VIETNAMESE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const cases: Array<[unknown, RegExp]> = [
  [{ code: "invalid_credentials" }, /incorrect email or password/i],
  [{ code: "email_not_confirmed" }, /confirm your email/i],
  [{ code: "user_already_exists" }, /already registered/i],
  [{ code: "weak_password" }, /at least 8 characters/i],
  [{ code: "over_email_send_rate_limit" }, /too many emails/i],
  [{ code: "same_password" }, /different from your current/i],
  [{ message: "Token has expired or is invalid" }, /invalid or has expired/i],
  [new TypeError("Failed to fetch"), /can't reach the server/i],
  [{ message: "email is required" }, /enter your email/i],
  [{ message: "password is required" }, /enter your password/i],
  [{ message: "something unexpected" }, /couldn't complete your request/i],
];

describe("getFriendlyAuthError", () => {
  it.each(cases)("maps %o to an English message", (error, expected) => {
    const text = getFriendlyAuthError(error);
    expect(text).toMatch(expected);
    expect(text).not.toMatch(VIETNAMESE);
  });

  it("keeps each failure class distinct", () => {
    const messages = cases.map(([error]) => getFriendlyAuthError(error));
    expect(new Set(messages).size).toBe(messages.length);
  });
});
