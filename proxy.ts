import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/* =========================================================
   NEXT.JS PROXY

   Next.js 16 loads this file only from the project root
   (or src/), never from app/. The route-protection logic
   itself lives in lib/supabase/proxy.ts so it can be
   unit-tested independently of the framework entry point.
========================================================= */

export async function proxy(request: NextRequest) {
  return updateSession(request);
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
