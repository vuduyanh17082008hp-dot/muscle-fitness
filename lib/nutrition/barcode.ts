/**
 * Barcode normalization (spec: "BARCODE VALIDATION"). Pure, no I/O —
 * used by both the client (manual entry + scanner) and the barcode
 * API route so every entry point agrees on what counts as a valid
 * barcode and how it's normalized before an Open Food Facts lookup.
 *
 * Open Food Facts itself normalizes common representations, so this
 * intentionally does the minimum necessary: strip spacing/hyphens, reject
 * anything that isn't a plausible retail barcode length, and expand
 * UPC-E to its UPC-A equivalent (OFF/most databases are indexed by
 * the expanded form).
 */

export type BarcodeFormat = "EAN-13" | "EAN-8" | "UPC-A" | "UPC-E"

export type NormalizedBarcode = {
  /** Digits-only code to send to the lookup API. */
  code: string
  format: BarcodeFormat
}

function computeUpcCheckDigit(digits11: string): string {
  let oddPositionSum = 0
  let evenPositionSum = 0

  for (let i = 0; i < 11; i += 1) {
    const digit = Number(digits11[i])

    if (i % 2 === 0) {
      oddPositionSum += digit
    } else {
      evenPositionSum += digit
    }
  }

  const total = oddPositionSum * 3 + evenPositionSum
  const remainder = total % 10

  return String(remainder === 0 ? 0 : 10 - remainder)
}

/** Expands a 6/7/8-digit UPC-E code to its 12-digit UPC-A equivalent. Returns null if the input isn't well-formed UPC-E. */
export function expandUpcEToUpcA(input: string): string | null {
  if (!/^\d{6,8}$/.test(input)) return null

  let numberSystem = "0"
  let payload = input
  let checkDigit: string | null = null

  if (input.length === 7) {
    numberSystem = input[0]
    payload = input.slice(1)
  } else if (input.length === 8) {
    numberSystem = input[0]
    payload = input.slice(1, 7)
    checkDigit = input[7]
  } else if (input.length !== 6) {
    return null
  }

  if (payload.length !== 6 || !/^\d{6}$/.test(payload)) {
    return null
  }

  if (numberSystem !== "0" && numberSystem !== "1") {
    return null
  }

  const d = payload.split("")
  const lastDigit = d[5]

  let manufacturer: string
  let productItem: string

  switch (lastDigit) {
    case "0":
    case "1":
    case "2":
      manufacturer = `${d[0]}${d[1]}${lastDigit}00`
      productItem = `00${d[2]}${d[3]}${d[4]}`
      break
    case "3":
      manufacturer = `${d[0]}${d[1]}${d[2]}00`
      productItem = `000${d[3]}${d[4]}`
      break
    case "4":
      manufacturer = `${d[0]}${d[1]}${d[2]}${d[3]}0`
      productItem = `0000${d[4]}`
      break
    default:
      manufacturer = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}`
      productItem = `0000${lastDigit}`
      break
  }

  const upcA11 = `${numberSystem}${manufacturer}${productItem}`
  const computedCheck = computeUpcCheckDigit(upcA11)
  if (checkDigit !== null && checkDigit !== computedCheck) return null
  const check = computedCheck

  return `${upcA11}${check}`
}

/**
 * GS1 mod-10 check: from the right, the check digit is excluded and the
 * remaining digits are weighted 3,1,3,1… The same rule covers EAN-8,
 * UPC-A, EAN-13 and GTIN-14, and leading-zero padding never changes it.
 */
export function hasValidGtinCheckDigit(code: string): boolean {
  if (!/^\d{8,14}$/.test(code)) return false
  let sum = 0
  for (let i = code.length - 2, weight = 3; i >= 0; i -= 1, weight = 4 - weight) {
    sum += Number(code[i]) * weight
  }
  return (10 - (sum % 10)) % 10 === Number(code[code.length - 1])
}

/**
 * Normalizes raw scanner/manual-entry text into a lookup-ready
 * barcode. Returns null for anything that isn't a plausible numeric
 * retail barcode — arbitrary text is never accepted as a barcode, and
 * a code whose check digit is wrong (a misread or typo) is rejected
 * before any provider lookup rather than reported as "not found".
 */
export function normalizeBarcode(raw: string): NormalizedBarcode | null {
  if (!/^[0-9\s-]+$/.test(raw) || raw.length > 64) return null
  const digitsOnly = raw.replace(/[\s-]/g, "")

  if (!digitsOnly) {
    return null
  }

  if ([8, 12, 13, 14].includes(digitsOnly.length) && !hasValidGtinCheckDigit(digitsOnly)) {
    // 8 digits may still be a UPC-E with its own check digit.
    const upcE = digitsOnly.length === 8 ? expandUpcEToUpcA(digitsOnly) : null
    return upcE ? { code: upcE, format: "UPC-E" } : null
  }

  if (digitsOnly.length === 8) {
    return { code: digitsOnly, format: "EAN-8" }
  }

  if (digitsOnly.length === 12) {
    return { code: digitsOnly, format: "UPC-A" }
  }

  if (digitsOnly.length === 13) {
    return { code: digitsOnly, format: "EAN-13" }
  }

  if (digitsOnly.length === 14 && digitsOnly.startsWith("0")) {
    // GTIN-14 padding — strip leading zeros back to a 13-digit EAN.
    const trimmed = digitsOnly.slice(1)
    return { code: trimmed, format: "EAN-13" }
  }

  if (digitsOnly.length === 6 || digitsOnly.length === 7) {
    const expanded = expandUpcEToUpcA(digitsOnly)
    return expanded ? { code: expanded, format: "UPC-E" } : null
  }

  return null
}
