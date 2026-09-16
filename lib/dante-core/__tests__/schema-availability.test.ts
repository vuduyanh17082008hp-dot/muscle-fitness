import { describe, expect, it } from "vitest";

import { isMissingRelationError } from "@/lib/dante-core/memory-hierarchy/schema-availability";

describe("isMissingRelationError", () => {
  it("recognizes the PostgREST schema-cache miss for dante_learned_patterns", () => {
    expect(
      isMissingRelationError({
        message: "Could not find the table 'public.dante_learned_patterns' in the schema cache",
        code: "PGRST205",
      }),
    ).toBe(true);
  });

  it("does not treat unrelated errors as missing schema", () => {
    expect(isMissingRelationError({ message: "permission denied", code: "42501" })).toBe(false);
  });
});
