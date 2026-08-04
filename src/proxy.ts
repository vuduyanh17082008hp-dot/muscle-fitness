import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js 16 proxy entry (request pass-through).
 * Extend later for Supabase session refresh / auth cookies
 * (same role as middleware in older apps).
 */
export function proxy(request: NextRequest) {
  return NextResponse.next({
    request: {
      headers: request.headers,
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
