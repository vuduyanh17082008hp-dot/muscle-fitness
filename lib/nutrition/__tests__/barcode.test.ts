import { describe, expect, it } from "vitest"
import { expandUpcEToUpcA, normalizeBarcode } from "@/lib/nutrition/barcode"

describe("normalizeBarcode", () => {
  it("accepts a 13-digit EAN-13 code as-is (fixture check digit corrected: GS1 sum 91 → 9)", () => {
    const result = normalizeBarcode("7622210951359")
    expect(result).toEqual({ code: "7622210951359", format: "EAN-13" })
  })

  it("accepts an 8-digit EAN-8 code as-is", () => {
    const result = normalizeBarcode("96385074")
    expect(result).toEqual({ code: "96385074", format: "EAN-8" })
  })

  it("accepts a 12-digit UPC-A code as-is", () => {
    const result = normalizeBarcode("036000291452")
    expect(result).toEqual({ code: "036000291452", format: "UPC-A" })
  })

  it("strips spaces and hyphens before validating", () => {
    const result = normalizeBarcode(" 762-2210-951359 ")
    expect(result).toEqual({ code: "7622210951359", format: "EAN-13" })
  })

  it("normalizes a 14-digit GTIN by trimming to 13 digits", () => {
    const result = normalizeBarcode("07622210951359")
    expect(result?.format).toBe("EAN-13")
    expect(result?.code).toBe("7622210951359")
  })

  it("expands a 6-digit UPC-E code to a 12-digit UPC-A code", () => {
    const result = normalizeBarcode("425011")
    expect(result?.format).toBe("UPC-E")
    expect(result?.code).toHaveLength(12)
  })

  it("rejects arbitrary non-numeric text", () => {
    expect(normalizeBarcode("not-a-barcode")).toBeNull()
  })

  it("rejects an empty string", () => {
    expect(normalizeBarcode("")).toBeNull()
  })

  it("rejects an implausible barcode length", () => {
    expect(normalizeBarcode("123")).toBeNull()
  })
})

describe("expandUpcEToUpcA", () => {
  it("round-trips through the standard check-digit algorithm for a known UPC-E/UPC-A pair", () => {
    // 0425261 -> 042100005264 is a widely-cited reference UPC-E/UPC-A pair.
    const expanded = expandUpcEToUpcA("0425261")
    expect(expanded).toBe("042100005264")
  })

  it("returns null for malformed input", () => {
    expect(expandUpcEToUpcA("12")).toBeNull()
    expect(expandUpcEToUpcA("abcdef")).toBeNull()
  })
})


it.each(["food7622210951353", "https://example.com/7622210951353", "17622210951353"])("rejects ambiguous barcode %s instead of changing its identity", (input) => {
  expect(normalizeBarcode(input)).toBeNull();
});

it("validates explicit UPC-E check digits", () => {
  expect(expandUpcEToUpcA("04252614")).toBe("042100005264");
  expect(expandUpcEToUpcA("04252615")).toBeNull();
  expect(expandUpcEToUpcA("0425261x")).toBeNull();
});

describe("normalizeBarcode — GS1 check digit (rejected before any provider lookup)", () => {
  it.each([
    ["7622210951359", "EAN-13"],
    ["5000112637922", "EAN-13"],
    ["96385074", "EAN-8"],
    ["036000291452", "UPC-A"],
    ["07622210951359", "EAN-13"],
  ])("accepts valid %s", (code, format) => {
    expect(normalizeBarcode(code)?.format).toBe(format)
  })

  it.each(["7622210951354", "5000112637923", "96385075", "036000291453", "07622210951354"])(
    "rejects %s (wrong check digit)",
    (code) => {
      expect(normalizeBarcode(code)).toBeNull()
    },
  )

  it("keeps scanner formatting tolerant: spaced/hyphenated valid codes still pass", () => {
    expect(normalizeBarcode("0 36000 29145 2")).toEqual({ code: "036000291452", format: "UPC-A" })
    expect(normalizeBarcode("0 36000 29145 3")).toBeNull()
  })

  it("an 8-digit code that is not a valid EAN-8 but is a valid UPC-E is expanded as UPC-E", () => {
    expect(normalizeBarcode("04252614")).toEqual({ code: "042100005264", format: "UPC-E" })
    expect(normalizeBarcode("04252615")).toBeNull()
  })
})
