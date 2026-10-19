import type { CravingInfo, MacroTotals } from "./types"

/**
 * Claim-safe comparison: ranges only, ESTIMATED label, no ratios or
 * percentages ("90% same taste", "1/5 calories", "3x protein") and never
 * "zero-calorie".
 */
export function compareToOriginal(original: CravingInfo["original"], mf: MacroTotals): string[] {
  const [calLow, calHigh] = original.caloriesRange
  const [proLow, proHigh] = original.proteinRange
  const lines: string[] = []

  if (mf.calories < calLow) lines.push(`Lower-calorie than a typical bowl (estimated ${calLow}–${calHigh} kcal).`)
  else if (mf.calories <= calHigh) lines.push(`In the typical calorie range for a bowl like this (estimated ${calLow}–${calHigh} kcal).`)
  else lines.push(`Above the typical calorie range (estimated ${calLow}–${calHigh} kcal) — scale the portion down if it doesn't fit.`)

  if (mf.protein > proHigh) lines.push(`Higher-protein than a typical bowl (estimated ${proLow}–${proHigh} g).`)
  else lines.push(`Protein is in the typical range (estimated ${proLow}–${proHigh} g).`)

  lines.push("The original's numbers are estimates and vary by brand and bowl size.")
  return lines
}

/** Text that would overstate a craving comparison — used at runtime and in tests. */
export const UNSAFE_CRAVING_CLAIMS = /\b\d+\s?%\s+(same|the same)|zero[- ]calorie|\b\d+(\.\d+)?\s?x\b|\b1\/\d\b|\b\d+\s?times\b/i

