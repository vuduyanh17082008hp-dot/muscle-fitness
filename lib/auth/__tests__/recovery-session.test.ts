import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { createServerClient } from "@supabase/ssr";
import { GET as callback } from "@/app/auth/callback/route";
import { GET as confirm } from "@/app/auth/confirm/route";
import ResetPasswordPage from "@/app/reset-password/page";
import { isRecoverySession, RECOVERY_WINDOW_SECONDS } from "@/lib/auth/recovery-session";
import { createClient } from "@/lib/supabase/server";
import { updateSession } from "@/lib/supabase/proxy";

const now = () => Math.floor(Date.now() / 1000);
const amr = (method: string, age = 0) => ({ sub: "user-1", amr: [{ method, timestamp: now() - age }] });
const RECOVERY = () => amr("recovery");
const STALE_RECOVERY = () => amr("recovery", RECOVERY_WINDOW_SECONDS + 1);
const OTP = () => amr("otp");
const PASSWORD = () => amr("password");

type Claims = { sub: string; amr?: unknown } | null;

function mockAuth(claims: Claims) {
  const auth = {
    getClaims: async () => ({ data: claims ? { claims } : null, error: null }),
    getUser: async () => ({
      data: { user: claims ? { id: claims.sub } : null },
      error: claims ? null : { message: "no session" },
    }),
  };
  vi.mocked(createServerClient).mockReturnValue({ auth } as never);
  vi.mocked(createClient).mockResolvedValue({ auth } as never);
}

async function proxy(pathname: string) {
  const response = await updateSession(
    new NextRequest(`https://app.test${pathname}`),
  );
  const location = response.headers.get("location");
  return location ? new URL(location).pathname : "next";
}

async function page() {
  try {
    await ResetPasswordPage();
    return "rendered";
  } catch (error) {
    return String((error as Error).message);
  }
}

const location = (response: Response) => response.headers.get("location") ?? "";

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
});

describe("isRecoverySession", () => {
  it("accepts only a recent signed recovery method", () => {
    expect(isRecoverySession(RECOVERY())).toBe(true);
    expect(isRecoverySession(STALE_RECOVERY())).toBe(false);
    expect(isRecoverySession(OTP())).toBe(false);
    expect(isRecoverySession(amr("magiclink"))).toBe(false);
    expect(isRecoverySession(PASSWORD())).toBe(false);
    expect(isRecoverySession(amr("oauth"))).toBe(false);
    expect(isRecoverySession({ amr: ["recovery"] })).toBe(false);
    expect(isRecoverySession({})).toBe(false);
    expect(isRecoverySession(null)).toBe(false);
  });
});

describe("proxy: /reset-password", () => {
  it("lets a recovery session reach the reset form", async () => {
    mockAuth(RECOVERY());
    expect(await proxy("/reset-password")).toBe("next");
  });

  it("sends password, OTP and expired recovery sessions to the dashboard", async () => {
    for (const claims of [PASSWORD(), OTP(), STALE_RECOVERY()]) {
      mockAuth(claims);
      expect(await proxy("/reset-password")).toBe("/dashboard");
    }
  });

  it("does not open the other auth pages to a recovery session", async () => {
    mockAuth(RECOVERY());
    for (const path of ["/login", "/register", "/forgot-password"]) {
      expect(await proxy(path)).toBe("/dashboard");
    }
  });

  it("keeps protected routes behind login", async () => {
    mockAuth(null);
    expect(await proxy("/dashboard")).toBe("/login");
    expect(await proxy("/reset-password")).toBe("next");
  });
});

describe("reset-password page", () => {
  it("renders for a recovery session", async () => {
    mockAuth(RECOVERY());
    expect(await page()).toBe("rendered");
  });

  it("redirects password, OTP and expired recovery sessions to the dashboard", async () => {
    for (const claims of [PASSWORD(), OTP(), STALE_RECOVERY()]) {
      mockAuth(claims);
      expect(await page()).toBe("REDIRECT:/dashboard");
    }
  });

  it("redirects a signed-out visitor to forgot-password", async () => {
    mockAuth(null);
    expect(await page()).toBe(
      "REDIRECT:/forgot-password?error=invalid-reset-link",
    );
  });
});

describe("recovery link routes", () => {
  it("sends a failed recovery callback back to forgot-password", async () => {
    for (const query of [
      "error=access_denied&error_description=Email+link+is+invalid+or+has+expired&next=%2Freset-password",
      "next=/reset-password",
    ]) {
      expect(location(await callback(new NextRequest(`https://app.test/auth/callback?${query}`)))).toBe(
        "https://app.test/forgot-password?error=invalid-reset-link",
      );
    }
  });

  it("keeps the login error for other callbacks", async () => {
    const response = await callback(new NextRequest("https://app.test/auth/callback?error=access_denied"));
    expect(new URL(location(response)).pathname).toBe("/login");
  });

  it("hands a token_hash recovery link to GoTrue so it finishes as a PKCE exchange", async () => {
    const response = await confirm(
      new NextRequest("https://app.test/auth/confirm?token_hash=pkce_abc&type=recovery"),
    );
    const url = new URL(location(response));
    expect(`${url.origin}${url.pathname}`).toBe("https://project.supabase.co/auth/v1/verify");
    expect(url.searchParams.get("token")).toBe("pkce_abc");
    expect(url.searchParams.get("type")).toBe("recovery");
    expect(url.searchParams.get("redirect_to")).toBe("https://app.test/auth/callback?next=/reset-password");
    expect(createClient).not.toHaveBeenCalled();
  });
});
