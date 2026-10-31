/**
 * Iron & Paper (V4) rollout for the dashboard shell: the routes whose
 * screens have passed the paper gate (contrast test + visual check).
 * Only these render data-theme="paper" (app/paper-theme.css); every
 * other route keeps the dark system. An entry is an exact path, or a
 * subtree when it ends in "/*". Public pages mark their own root.
 */
export const PAPER_ROUTES: readonly string[] = [];

export function isPaperRoute(pathname: string, routes: readonly string[] = PAPER_ROUTES): boolean {
  return routes.some((route) => {
    if (!route.endsWith("/*")) return pathname === route;
    const base = route.slice(0, -2);
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}
