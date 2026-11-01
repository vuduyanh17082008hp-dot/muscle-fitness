import { describe, expect, it } from "vitest"

import { parseGoogleEnabled } from "@/lib/auth/google-availability"

describe("parseGoogleEnabled", () => {
  it("reads GoTrue's explicit provider flag", () => {
    expect(parseGoogleEnabled({ external: { google: false, email: true } })).toBe(false)
    expect(parseGoogleEnabled({ external: { google: true } })).toBe(true)
  })

  it("stays unknown for anything else, so the normal flow is kept", () => {
    expect(parseGoogleEnabled(null)).toBeNull()
    expect(parseGoogleEnabled({})).toBeNull()
    expect(parseGoogleEnabled({ external: { google: "yes" } })).toBeNull()
  })
})
