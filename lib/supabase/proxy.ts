import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"

import type { NextRequest } from "next/server"

import type { Database } from "@/lib/database/types"
import { getSupabaseEnvironment } from "@/lib/supabase/env"

export async function updateSession(
  request: NextRequest,
) {
  let response = NextResponse.next({
    request,
  })

  const { url, publicKey } =
    getSupabaseEnvironment()

  const supabase =
    createServerClient<Database>(
      url,
      publicKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },

          setAll(cookiesToSet) {
            cookiesToSet.forEach(
              ({ name, value }) => {
                request.cookies.set(
                  name,
                  value,
                )
              },
            )

            response = NextResponse.next({
              request,
            })

            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                response.cookies.set(
                  name,
                  value,
                  options,
                )
              },
            )
          },
        },
      },
    )

  /*
   * Không xóa dòng này.
   * Lệnh getUser giúp kiểm tra và refresh session.
   */
  await supabase.auth.getUser()

  return response
}