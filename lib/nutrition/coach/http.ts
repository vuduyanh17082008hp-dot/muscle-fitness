const MAX_COACH_BODY_BYTES = 64 * 1024

export type CoachJsonBody =
  | { ok: true; body: unknown }
  | { ok: false; tooLarge: boolean }

/** Reads JSON with a hard byte ceiling, including chunked requests. */
export async function readCoachJsonBody(request: Request): Promise<CoachJsonBody> {
  const declaredLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_COACH_BODY_BYTES) {
    return { ok: false, tooLarge: true }
  }

  if (!request.body) return { ok: false, tooLarge: false }

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_COACH_BODY_BYTES) {
        await reader.cancel()
        return { ok: false, tooLarge: true }
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return { ok: true, body: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, tooLarge: false }
  }
}
