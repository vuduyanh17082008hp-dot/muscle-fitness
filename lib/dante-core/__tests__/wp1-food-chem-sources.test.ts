/**
 * H0 WP1 closure — food/chemistry source error visibility, through the REAL route (the adapters are route-local).
 * Only `fetch` is faked. Central contract: a real dependency failure must NEVER become SUCCESS through empty data;
 * a 404 (the source's "no match") stays a legitimate empty result.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/dante-core/llm-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dante-core/llm-client")>();
  return { ...actual, callDanteLlm: vi.fn(async () => null) };
});

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk } from "@/lib/dante-core/chat-stream-protocol";
import { createClient } from "@/lib/supabase/server";
import { createFakeCoherenceTable, fakeCoherenceFrom } from "./support/fake-coherence-supabase";

type Mode = "ok" | "404" | "500" | "429" | "malformed" | "network" | "hang";
const modes: Record<"pubchem" | "openfda" | "usda" | "openfoodfacts" | "pubmed", Mode> = {
  pubchem: "ok",
  openfda: "ok",
  usda: "ok",
  openfoodfacts: "ok",
  pubmed: "404",
};
const providerPrompts: string[] = [];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const OK_BODY: Record<keyof typeof modes, unknown> = {
  pubchem: { PropertyTable: { Properties: [{ CID: 2724480, Title: "Caffeine", MolecularFormula: "C26H45NO6S", MolecularWeight: "499.7", IUPACName: "caffeine" }] } },
  openfda: { results: [{ purpose: ["bile acid"], warnings: ["consult a doctor"], adverse_reactions: ["diarrhea"] }] },
  usda: { foods: [{ fdcId: 171287, description: "Egg, whole, raw", foodNutrients: [] }] },
  openfoodfacts: { products: [{ code: "1", product_name: "Greek yogurt", nutriments: {} }] },
  pubmed: { esearchresult: { idlist: [] } },
};

function answer(source: keyof typeof modes, signal?: AbortSignal | null): Promise<Response> {
  switch (modes[source]) {
    case "ok":
      return Promise.resolve(json(OK_BODY[source]));
    case "404":
      return Promise.resolve(source === "pubmed" ? json(OK_BODY.pubmed) : json({ error: "not found" }, 404));
    case "500":
      return Promise.resolve(json({ error: "upstream" }, 500));
    case "429":
      return Promise.resolve(json({ error: "slow down" }, 429));
    case "malformed":
      return Promise.resolve(json({ unexpected: true }));
    case "network":
      return Promise.reject(new TypeError("fetch failed"));
    case "hang":
      // Ends only when the request's signal aborts (the adapter's own 7s timeout, the phase, or the client).
      return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason)));
  }
}

beforeEach(() => {
  Object.assign(modes, { pubchem: "ok", openfda: "ok", usda: "ok", openfoodfacts: "ok", pubmed: "404" });
  providerPrompts.length = 0;
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("USDA_FDC_API_KEY", "test");
  const from = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-0000000000c2" } }, error: null }) },
    from: vi.fn((name: string) => from(name)),
  } as never);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://api.openai.com/")) {
      providerPrompts.push(typeof init?.body === "string" ? init.body : "");
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "Here is what I can say." } }] })}\n\ndata: [DONE]\n\n`, { status: 200 });
    }
    if (url.includes("pubchem.ncbi")) return answer("pubchem", init?.signal);
    if (url.includes("api.fda.gov")) return answer("openfda", init?.signal);
    if (url.includes("api.nal.usda.gov")) return answer("usda", init?.signal);
    if (url.includes("openfoodfacts.org")) return answer("openfoodfacts", init?.signal);
    if (/eutils\.ncbi|ebi\.ac\.uk|wsearch\.nlm/.test(url)) return answer("pubmed", init?.signal);
    throw new Error("network disabled in tests");
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const SUPPLEMENT = "what does the research say about caffeine";
const FOOD = "does a high protein breakfast meal improve my squat strength gains and recovery after training?";

async function post(message: string, signal?: AbortSignal) {
  const response = await POST(new Request("http://localhost/api/chatbot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, messages: [{ role: "user", content: message }] }),
    signal,
  }));
  const events = parseChatStreamChunk("", await response.text()).events;
  const done = events.find((e) => e.type === "done") as { toolTraceSummary?: string[]; sources?: Array<{ type?: string }> } | undefined;
  const wp1 = done?.toolTraceSummary?.find((line) => line.startsWith("wp1:ms=")) ?? "";
  const src = Object.fromEntries((/src=([^;]*)/.exec(wp1)?.[1] ?? "").split(",").filter(Boolean).map((pair) => pair.split(":")));
  return { done, wp1, src, phase: /phase=([A-Z_]+)/.exec(wp1)?.[1] };
}

describe("food/chemistry sources: dependency failure is never an empty SUCCESS", () => {
  it("A/G. 404 is a legitimate no-match: SUCCESS, empty, no source entry, never FAILED", async () => {
    Object.assign(modes, { pubchem: "404", openfda: "404" });
    const { src, phase, done, wp1 } = await post(SUPPLEMENT);
    expect(src.pubchem, wp1).toBe("SUCCESS");
    expect(src.openfda).toBe("SUCCESS");
    expect(phase).toBe("SUCCESS");
    expect(done?.sources?.some((s) => s.type === "PubChem" || s.type === "openFDA") ?? false).toBe(false);
  }, 30_000);

  it.each(["500", "429", "malformed"] as const)("B. provider failure (%s) propagates: FAILED, not SUCCESS", async (mode) => {
    Object.assign(modes, { pubchem: mode, openfda: mode });
    const { src, phase, wp1 } = await post(SUPPLEMENT);
    expect(src.pubchem, wp1).toBe("FAILED");
    expect(src.openfda).toBe("FAILED");
    expect(phase).not.toBe("SUCCESS");
  }, 30_000);

  it("B. food sources too: USDA 500 + Open Food Facts malformed are FAILED", async () => {
    Object.assign(modes, { usda: "500", openfoodfacts: "malformed" });
    const { src, done } = await post(FOOD);
    expect(src.usda, JSON.stringify(done?.toolTraceSummary)).toBe("FAILED");
    expect(src.openfoodfacts).toBe("FAILED");
  }, 30_000);

  it("C. network failure propagates: FAILED", async () => {
    Object.assign(modes, { pubchem: "network", openfda: "network" });
    const { src, wp1 } = await post(SUPPLEMENT);
    expect(src.pubchem, wp1).toBe("FAILED");
    expect(src.openfda).toBe("FAILED");
  }, 30_000);

  it("D. dependency timeout (the adapter's own 7s, inside the 10s phase): TIMED_OUT, not FAILED, not SUCCESS", async () => {
    Object.assign(modes, { pubchem: "hang", openfda: "hang" });
    const started = Date.now();
    const { src, wp1 } = await post(SUPPLEMENT);
    expect(src.pubchem, wp1).toBe("TIMED_OUT");
    expect(src.openfda).toBe("TIMED_OUT");
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 30_000);

  it("E. client abort while a source is in flight: no FAILED/TIMED_OUT label, no provider call, no reply", async () => {
    Object.assign(modes, { pubchem: "hang", openfda: "hang" });
    const client = new AbortController();
    const fetchMock = vi.mocked(globalThis.fetch);
    const pending = post(SUPPLEMENT, client.signal).catch(() => null);
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("pubchem.ncbi"))).toBe(true), { timeout: 15_000 });
    client.abort(Object.assign(new Error("client closed"), { name: "ResponseAborted" }));
    const result = await pending;
    expect(providerPrompts).toHaveLength(0);
    // Either the route ends with no done event (client gone), or whatever trace exists says CANCELLED.
    if (result?.wp1) {
      expect(result.src.pubchem).toBe("CANCELLED");
      expect(result.src.openfda).toBe("CANCELLED");
    }
  }, 30_000);

  it("F. mixed: PubChem succeeds, openFDA fails → PARTIAL; the success is kept, the failure is visible and adds no source", async () => {
    Object.assign(modes, { pubchem: "ok", openfda: "500" });
    const { src, phase, done, wp1 } = await post(SUPPLEMENT);
    expect(src.pubchem, wp1).toBe("SUCCESS");
    expect(src.openfda).toBe("FAILED");
    expect(phase).toBe("PARTIAL");
    const types = (done?.sources ?? []).map((s) => s.type);
    expect(types).toContain("PubChem");
    expect(types).not.toContain("openFDA");
    expect(providerPrompts.join("\n")).toContain("2724480");
  }, 30_000);

  it("REGRESSION: a real dependency failure must not become SUCCESS through empty data", async () => {
    for (const mode of ["500", "network", "malformed"] as const) {
      Object.assign(modes, { pubchem: mode, openfda: mode });
      const { src, phase } = await post(SUPPLEMENT);
      expect([src.pubchem, src.openfda, phase]).not.toContain("SUCCESS");
    }
  }, 60_000);

  it("unconfigured USDA is NOT_RUN (absent), never SUCCESS", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "");
    const { src, wp1 } = await post(FOOD);
    expect(src.openfoodfacts, wp1).toBe("SUCCESS"); // the food path did run
    expect(src.usda).toBeUndefined();
  }, 30_000);
});
