import { z } from "zod"

// The panels re-encode photos to a <=1280px JPEG (~0.3 MB), so ~2 MB of base64 per image is generous, and two of
// them (before/after) still stay under the 4.5 MB serverless request-body limit.
export const MAX_IMAGE_LENGTH = 2_000_000
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/

export const imageDataUrl = z
  .string()
  .min(1)
  .max(MAX_IMAGE_LENGTH)
  .refine((value) => IMAGE_DATA_URL.test(value), { message: "Image must be a JPEG, PNG or WebP data URL." })

/** The user-facing reason a body's image fields were rejected: too large (413) or not a usable image (400). */
export function imageRejection(body: unknown, fields: string[]): { error: string; status: 400 | 413 } {
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>
  const tooLarge = fields.some((field) => typeof record[field] === "string" && (record[field] as string).length > MAX_IMAGE_LENGTH)
  return tooLarge
    ? { error: "That image is too large. Try a smaller photo.", status: 413 }
    : { error: "Unsupported image. Use a JPEG, PNG or WebP photo.", status: 400 }
}
