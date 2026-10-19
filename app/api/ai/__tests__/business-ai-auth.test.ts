import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/ai/campaign-generation", () => ({
  generateCampaign: vi.fn(),
}));

vi.mock("@/lib/ai/business-insights", () => ({
  generateBusinessInsights: vi.fn(),
}));

vi.mock("@/lib/ai/member-analysis", () => ({
  analyseMember: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({
  OPENAI_MODEL: "test-model",
  createOpenAiChatCompletion: vi.fn(async () => {
    throw new Error("OpenAI client must not be called from these tests");
  }),
}));

import { POST as postCampaign } from "@/app/api/ai/campaign/route";
import { POST as postInsights } from "@/app/api/ai/business-insights/route";
import { POST as postMember } from "@/app/api/ai/member-analysis/route";
import { generateCampaign } from "@/lib/ai/campaign-generation";
import { generateBusinessInsights } from "@/lib/ai/business-insights";
import { analyseMember } from "@/lib/ai/member-analysis";
import { createOpenAiChatCompletion } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";

const USER_ID = "user-admin-1";
const BUSINESS_ID = "biz-1";

const VALID_CAMPAIGN = {
  objective: "retain members",
  segmentName: "at risk",
  segmentDescription: "have not visited in 14 days",
};

const VALID_INSIGHTS = {
  activeMembers: 10,
  atRiskMembers: 2,
  engagementRate: 50,
  retentionRate: 80,
};

const VALID_MEMBER = {
  daysSinceLastVisit: 5,
  sessions30d: 8,
  sessionsPrevious30d: 10,
  workoutAdherence: 70,
  engagementScore: 60,
  progressSignal: 50,
};

const ROUTES = [
  {
    name: "/api/ai/campaign",
    post: postCampaign,
    valid: VALID_CAMPAIGN,
    generator: generateCampaign,
    generated: { name: "draft", status: "ok" },
  },
  {
    name: "/api/ai/business-insights",
    post: postInsights,
    valid: VALID_INSIGHTS,
    generator: generateBusinessInsights,
    generated: { insights: [] },
  },
  {
    name: "/api/ai/member-analysis",
    post: postMember,
    valid: VALID_MEMBER,
    generator: analyseMember,
    generated: { riskLevel: "low" },
  },
] as const;

function thenable(data: unknown[] | null, error: unknown = null) {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    order: () => query,
    limit: async () => ({ data, error }),
  };
  return query;
}

function unauthenticatedClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: { message: "no session" },
      }),
    },
    from: () => {
      throw new Error("business tables must not be queried without a session");
    },
  };
}

function ownerClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: USER_ID } },
        error: null,
      }),
    },
    from(table: string) {
      if (table === "businesses") {
        return thenable([
          {
            id: BUSINESS_ID,
            name: "Gym",
            slug: "gym",
            owner_id: USER_ID,
          },
        ]);
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function clientRoleClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: USER_ID } },
        error: null,
      }),
    },
    from(table: string) {
      if (table === "businesses" || table === "business_staff") {
        return thenable([]);
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function postJson(
  handler: (request: Request) => Promise<Response>,
  url: string,
  body: unknown,
) {
  return handler(
    new Request(`http://localhost${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("business AI route authorization", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(generateCampaign).mockReset();
    vi.mocked(generateBusinessInsights).mockReset();
    vi.mocked(analyseMember).mockReset();
    vi.mocked(createOpenAiChatCompletion).mockClear();
  });

  describe.each(ROUTES)("$name", ({ name, post, valid, generator, generated }) => {
    it("returns 401 and does not invoke AI when there is no session", async () => {
      vi.mocked(createClient).mockResolvedValue(unauthenticatedClient() as never);

      const response = await postJson(post, name, valid);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json).toEqual({ error: "Unauthorized" });
      expect(generator).not.toHaveBeenCalled();
      expect(createOpenAiChatCompletion).not.toHaveBeenCalled();
    });

    it("returns 401 before parsing the body", async () => {
      vi.mocked(createClient).mockResolvedValue(unauthenticatedClient() as never);

      const response = await postJson(post, name, "{");

      expect(response.status).toBe(401);
      expect(generator).not.toHaveBeenCalled();
      expect(createOpenAiChatCompletion).not.toHaveBeenCalled();
    });

    it("returns 403 and does not invoke AI for an authenticated non-admin", async () => {
      vi.mocked(createClient).mockResolvedValue(clientRoleClient() as never);

      const response = await postJson(post, name, {
        ...valid,
        role: "admin",
      });
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json).toEqual({ error: "Forbidden" });
      expect(generator).not.toHaveBeenCalled();
      expect(createOpenAiChatCompletion).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid input and does not invoke AI", async () => {
      vi.mocked(createClient).mockResolvedValue(ownerClient() as never);

      const response = await postJson(post, name, {});

      expect(response.status).toBe(400);
      expect(generator).not.toHaveBeenCalled();
      expect(createOpenAiChatCompletion).not.toHaveBeenCalled();
    });

    it("invokes the business AI generator for a valid business admin", async () => {
      vi.mocked(createClient).mockResolvedValue(ownerClient() as never);
      vi.mocked(generator).mockResolvedValue(generated as never);

      const response = await postJson(post, name, valid);

      expect(response.status).toBe(200);
      expect(generator).toHaveBeenCalledTimes(1);
      expect(createOpenAiChatCompletion).not.toHaveBeenCalled();
    });
  });
});

describe("/api/ai/campaign malformed JSON", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(generateCampaign).mockReset();
  });

  it("returns 403 for a non-admin before treating the body as a campaign", async () => {
    vi.mocked(createClient).mockResolvedValue(clientRoleClient() as never);

    const response = await postJson(postCampaign, "/api/ai/campaign", "{");

    expect(response.status).toBe(403);
    expect(generateCampaign).not.toHaveBeenCalled();
  });

  it("returns 400 for an admin and does not call the generator", async () => {
    vi.mocked(createClient).mockResolvedValue(ownerClient() as never);

    const response = await postJson(postCampaign, "/api/ai/campaign", "{");
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "Invalid campaign request" });
    expect(generateCampaign).not.toHaveBeenCalled();
  });
});
