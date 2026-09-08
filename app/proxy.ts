import type {
  NextRequest,
} from "next/server";

import {
  updateSession,
} from "@/lib/supabase/proxy";

/* =========================================================
   NEXT.JS PROXY
========================================================= */

export async function proxy(
  request: NextRequest,
) {
  return updateSession(
    request,
  );
}

/* =========================================================
   MATCHER

   Ignore static assets and Next.js internals.
========================================================= */

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|apple-touch-icon.png|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|woff|woff2|ttf|otf)$).*)",
  ],
};