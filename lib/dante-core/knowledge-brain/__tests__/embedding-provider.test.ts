import { afterEach, describe, expect, it, vi } from "vitest";
import {
  embedBatch,
  embedText,
  isEmbeddingProviderConfigured,
} from "@/lib/dante-core/knowledge-brain/embedding-provider";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("embedding provider (test E: embedding failure never breaks Dante)", () => {
  it("reports not configured, and embedText/embedBatch resolve to null, when no API key is set", async () => {
    delete process.env.DANTE_EMBEDDING_API_KEY;

    expect(isEmbeddingProviderConfigured()).toBe(false);
    await expect(embedText("hello")).resolves.toBeNull();
    await expect(embedBatch(["hello", "world"])).resolves.toBeNull();
  });

  it("returns null instead of throwing when the embedding request fails", async () => {
    process.env.DANTE_EMBEDDING_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 })),
    );

    await expect(embedText("hello")).resolves.toBeNull();
  });

  it("returns null instead of throwing when the request itself throws (network error)", async () => {
    process.env.DANTE_EMBEDDING_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unreachable");
      }),
    );

    await expect(embedText("hello")).resolves.toBeNull();
  });

  it("returns null when the provider returns a vector of the wrong dimensionality", async () => {
    process.env.DANTE_EMBEDDING_API_KEY = "test-key";
    process.env.DANTE_EMBEDDING_DIMENSIONS = "1536";

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [{ embedding: new Array(3).fill(0.1), index: 0 }] }), {
            status: 200,
          }),
      ),
    );

    await expect(embedText("hello")).resolves.toBeNull();
  });

  it("returns a validated vector on success", async () => {
    process.env.DANTE_EMBEDDING_API_KEY = "test-key";
    process.env.DANTE_EMBEDDING_DIMENSIONS = "3";

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }] }), {
            status: 200,
          }),
      ),
    );

    const result = await embedText("hello");
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });
});
