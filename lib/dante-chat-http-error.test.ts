import { describe, expect, it } from "vitest";

import {
  DANTE_RATE_LIMITED_MESSAGE,
  DANTE_SESSION_EXPIRED_MESSAGE,
  DANTE_UNAVAILABLE_MESSAGE,
  danteHttpFailureCopy,
  isDanteRateLimitedMessage,
} from "./dante-chat-http-error";

describe("danteHttpFailureCopy", () => {
  it("maps 401 to an explicit session message", () => {
    expect(danteHttpFailureCopy(401)).toBe(DANTE_SESSION_EXPIRED_MESSAGE);
    expect(danteHttpFailureCopy(401)).not.toMatch(/couldn't complete that response/i);
  });

  it("maps application 429 to explicit retry guidance", () => {
    const message = danteHttpFailureCopy(429, 17);
    expect(message).toBe(`${DANTE_RATE_LIMITED_MESSAGE} Try again in 17 seconds.`);
    expect(isDanteRateLimitedMessage(message)).toBe(true);
  });

  it("keeps the generic fallback for internal failures", () => {
    expect(danteHttpFailureCopy(500)).toBe(DANTE_UNAVAILABLE_MESSAGE);
  });
});
