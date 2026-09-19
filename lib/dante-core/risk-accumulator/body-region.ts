import { normalizeSafetyText } from "@/lib/dante-core/safety-layer";
import type { BodyRegion } from "@/lib/dante-core/risk-accumulator/types";

/**
 * Map multilingual region phrases to canonical BodyRegion.
 * Does not collapse left/right or invent laterality.
 */
export function normalizeBodyRegion(message: string): BodyRegion | null {
  const text = normalizeSafetyText(message);

  if (/(?:right\s+shoulder|shoulder\s+ben\s+phai|vai\s+phai|vai\s+ben\s+phai)/i.test(text)) {
    return "RIGHT_SHOULDER";
  }
  if (/(?:left\s+shoulder|shoulder\s+ben\s+trai|vai\s+trai|vai\s+ben\s+trai)/i.test(text)) {
    return "LEFT_SHOULDER";
  }
  // Unspecified shoulder — never invent laterality.
  if (/(?:\bvai\b|\bshoulder\b)/i.test(text)) {
    return "SHOULDER_UNSPECIFIED";
  }

  if (/(?:right\s+elbow|khuyu\s+tay\s+phai|elbow\s+phai)/i.test(text)) return "RIGHT_ELBOW";
  if (/(?:left\s+elbow|khuyu\s+tay\s+trai|elbow\s+trai)/i.test(text)) return "LEFT_ELBOW";
  if (/(?:\belbow\b|khuyu\s+tay)/i.test(text)) return "OTHER";

  if (/(?:right\s+knee|goi\s+phai|dau\s+goi\s+phai)/i.test(text)) return "RIGHT_KNEE";
  if (/(?:left\s+knee|goi\s+trai|dau\s+goi\s+trai)/i.test(text)) return "LEFT_KNEE";
  if (/(?:\bknee\b|\bgoi\b|dau\s+goi)/i.test(text)) return "OTHER";

  if (/(?:lower\s+back|that\s+lung|lung\s+duoi|\blumbar\b)/i.test(text)) return "LOWER_BACK";
  if (/(?:upper\s+back|lung\s+tren)/i.test(text)) return "UPPER_BACK";
  if (/(?:\bhip\b|\bhong\b)/i.test(text)) return "HIP";
  if (/(?:\bquads?\b|\bdui\s+truoc\b|\blegs?\b.*\bsore\b)/i.test(text)) return "QUADS";

  return null;
}

/** Exact region identity — unspecified shoulder does not equal left/right. */
export function regionsMatch(a: BodyRegion | undefined, b: BodyRegion | undefined): boolean {
  return Boolean(a && b && a === b);
}
