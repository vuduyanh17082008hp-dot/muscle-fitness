import { existsSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <Args extends unknown[], Result>(
      fn: (...args: Args) => Result,
    ) => fn,
  };
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  requireCompletedOnboarding,
  requireUser,
} from "@/lib/auth/guard";
import SettingsAliasPage from "@/app/settings/page";

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  onboarding_completed: boolean;
} | null;

function mockClient(options: {
  user?: { id: string; user_metadata?: Record<string, unknown> } | null;
  authError?: { message: string } | null;
  profile?: ProfileRow;
  profileError?: { message: string; code?: string } | null;
  profileStatus?: number;
  onProfileQuery?: () => void;
}) {
  const user = options.user === undefined
    ? { id: "user-1", user_metadata: { full_name: "Ada" } }
    : options.user;

  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user },
        error: options.authError ?? (user ? null : { message: "no session" }),
      }),
    },
    from: (table: string) => {
      expect(table).toBe("profiles");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              options.onProfileQuery?.();
              return {
                data: options.profile ?? null,
                error: options.profileError ?? null,
                status: options.profileStatus ?? 200,
              };
            },
          }),
        }),
      };
    },
  } as never);
}

async function expectRedirect(
  action: () => Promise<unknown>,
  destination: string,
) {
  await expect(action()).rejects.toThrow(`REDIRECT:${destination}`);
}

describe("dashboard onboarding guard", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it("sends unauthenticated callers to login", async () => {
    mockClient({ user: null });
    await expectRedirect(requireUser, "/login?next=/dashboard");
  });

  it("sends incomplete onboarding to /onboarding", async () => {
    mockClient({
      profile: {
        user_id: "user-1",
        full_name: "Ada",
        onboarding_completed: false,
      },
    });
    await expectRedirect(
      () => requireCompletedOnboarding(),
      "/onboarding?next=%2Fdashboard",
    );
  });

  it("sends a missing profile to /onboarding", async () => {
    mockClient({ profile: null });
    await expectRedirect(
      () => requireCompletedOnboarding(),
      "/onboarding?next=%2Fdashboard",
    );
  });

  it("lets a completed user through", async () => {
    mockClient({
      profile: {
        user_id: "user-1",
        full_name: "Ada",
        onboarding_completed: true,
      },
    });

    const result = await requireCompletedOnboarding();
    expect(result.userId).toBe("user-1");
    expect(result.profile.onboarding_completed).toBe(true);
    expect(result.profile.full_name).toBe("Ada");
  });
});

describe("profile guard keeps the failure class", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    ["future-issued JWT", { code: "PGRST303", message: "JWT issued at future" }, 401, /session could not be verified \(AUTH_CLOCK_SKEW_OR_FUTURE_IAT\)/],
    ["expired JWT", { code: "PGRST303", message: "JWT expired" }, 401, /session could not be verified \(AUTH_EXPIRED\)/],
    ["invalid JWT", { code: "PGRST301", message: "JWSError" }, 401, /session could not be verified \(AUTH_INVALID\)/],
    ["RLS denial", { code: "42501", message: "permission denied" }, 403, /profile \(RLS_DENIED\)/],
    ["schema error", { code: "42703", message: "column does not exist" }, 400, /profile \(SCHEMA_MISMATCH\)/],
    ["dependency failure", { code: "", message: "TypeError: fetch failed" }, 0, /profile \(DEPENDENCY_FAILURE\)/],
  ])("%s throws its own disposition, never an onboarding redirect", async (_label, profileError, profileStatus, expected) => {
    let queries = 0;
    mockClient({ profileError, profileStatus, onProfileQuery: () => queries++ });
    const failure = requireCompletedOnboarding();
    await expect(failure).rejects.toThrow(expected);
    await expect(failure).rejects.not.toThrow(/REDIRECT/);
    // One query per call: no refresh/retry loop on a rejected token.
    expect(queries).toBe(1);
  });

  it("logs the disposition without the raw error message", async () => {
    const log = vi.mocked(console.error);
    mockClient({ profileError: { code: "PGRST303", message: "JWT issued at future" }, profileStatus: 401 });
    await expect(requireCompletedOnboarding()).rejects.toThrow();
    expect(log).toHaveBeenCalledWith("Unable to load dashboard onboarding context:", {
      disposition: "AUTH_CLOCK_SKEW_OR_FUTURE_IAT",
      code: "PGRST303",
      status: 401,
    });
  });

  it("repeated requests with the same rejected token stay bounded", async () => {
    let queries = 0;
    mockClient({ profileError: { code: "PGRST303", message: "JWT issued at future" }, profileStatus: 401, onProfileQuery: () => queries++ });
    for (let i = 0; i < 3; i++) await expect(requireCompletedOnboarding()).rejects.toThrow();
    expect(queries).toBe(3);
  });
});

describe("/settings alias", () => {
  it("redirects to /dashboard/settings", () => {
    expect(() => SettingsAliasPage()).toThrow("REDIRECT:/dashboard/settings");
  });
});

describe("signout path", () => {
  it("does not expose a GET /logout page", () => {
    const logoutPage = path.join(process.cwd(), "app", "logout");
    expect(existsSync(logoutPage)).toBe(false);
  });
});
