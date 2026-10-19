/** H0 WP1 closure: one budgeted callDanteLlm attempt is ONE HTTP request (the SDK's own retry is off when budgeted). */
import { afterEach, describe, expect, it, vi } from "vitest";

import { callDanteLlm } from "@/lib/dante-core/llm-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("callDanteLlm retry topology", () => {
  it("with a turn signal a transient 503 is not retried inside the SDK; without one the legacy single retry remains", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "busy" } }), { status: 503, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await callDanteLlm("x", { signal: new AbortController().signal })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    expect(await callDanteLlm("x")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15_000);

  it("an already-aborted turn signal never reaches the network", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await callDanteLlm("x", { signal: AbortSignal.abort() })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
