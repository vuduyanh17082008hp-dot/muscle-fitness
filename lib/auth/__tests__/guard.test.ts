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
  profileError?: { message: string } | null;
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
            maybeSingle: async () => ({
              data: options.profile ?? null,
              error: options.profileError ?? null,
            }),
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
