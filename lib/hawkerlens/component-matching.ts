import type { DishComponentTemplate } from "@/lib/hawkerlens/dishes";

/**
 * Matches a VLM-detected component name (free text, e.g. "chicken",
 * "rice with sauce") against a dish's curated component templates
 * (e.g. "Poached chicken with skin") — exact string matching would
 * almost never hit, since the model's wording varies. Simple token
 * overlap is enough here: the search space for any one dish is only
 * 3-6 components (dishes.ts), so this doesn't need to be
 * sophisticated to be reliable.
 */

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

export function matchComponentTemplate(
  detectedName: string,
  templates: DishComponentTemplate[],
): DishComponentTemplate | null {
  const detectedTokens = tokenize(detectedName);

  if (detectedTokens.size === 0 || templates.length === 0) {
    return null;
  }

  let best: DishComponentTemplate | null = null;
  let bestScore = 0;

  for (const template of templates) {
    const templateTokens = tokenize(template.name);
    let overlap = 0;

    for (const token of templateTokens) {
      if (detectedTokens.has(token)) overlap += 1;
    }

    // Also credit a raw substring match either direction — catches
    // cases like detected "sauce" vs template "chili sauce" where
    // tokenization alone still works, but this is a cheap safety net
    // for short single-word names.
    const detectedLower = detectedName.toLowerCase();
    const templateLower = template.name.toLowerCase();
    if (templateLower.includes(detectedLower) || detectedLower.includes(templateLower)) {
      overlap += 1;
    }

    if (overlap > bestScore) {
      bestScore = overlap;
      best = template;
    }
  }

  return bestScore > 0 ? best : null;
}
