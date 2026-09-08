/*
 * Placeholder chỉ dùng khi `next build` prerender mà chưa có env.
 *
 * Không có nó, một deploy thiếu env sẽ fail ngay ở bước build và
 * không có gì lên được production. Với nó, build thành công còn
 * runtime sẽ báo lỗi rõ ràng (xem proxy + client Supabase).
 *
 * Tuyệt đối không coi giá trị này là credential thật.
 */
const BUILD_PLACEHOLDER = {
  url: "https://build-placeholder.supabase.co",
  key: "build-placeholder-key",
} as const

function isNextProductionBuild(): boolean {
  return (
    process.env.NEXT_PHASE ===
    "phase-production-build"
  )
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    if (isNextProductionBuild()) {
      return {
        url: BUILD_PLACEHOLDER.url,
        key: BUILD_PLACEHOLDER.key,
      }
    }
  }

  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL in your .env.local file."
    )
  }

  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    )
  }

  return {
    url,
    key,
  }
}
