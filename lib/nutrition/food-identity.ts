/**
 * Stable food identity (spec: "FOOD IDENTITY"). Used to key serving
 * presets and "last used portion" memory so they attach to the same
 * real-world food every time — never to a display name alone, since
 * two different foods can share a name and the same food can be
 * renamed by its source.
 *
 * Priority: barcode > source+sourceId > null (no stable identity —
 * e.g. a free-text manual entry with no source id. Serving presets
 * and last-portion memory simply don't apply to those; grams/manual
 * entry still work fully.)
 */
export function computeFoodIdentity(input: {
  barcode?: string | null
  source: string
  sourceId?: string | null
}): string | null {
  if (input.barcode && input.barcode.trim()) {
    return `barcode:${input.barcode.trim()}`
  }

  if (input.sourceId && input.sourceId.trim()) {
    return `${input.source}:${input.sourceId.trim()}`
  }

  return null
}
