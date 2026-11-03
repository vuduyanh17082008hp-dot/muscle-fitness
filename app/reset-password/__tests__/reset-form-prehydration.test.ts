import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Before hydration the React onSubmit handler is not attached, so a click or
 * Enter would submit the server-rendered form natively as a GET with both
 * new-password fields in the URL. The submit button must render disabled.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";

describe("reset-password form before hydration", () => {
  it("server-renders every submit button disabled and no form action", () => {
    const html = renderToString(createElement(ResetPasswordForm));
    const [, attrs, body] = html.match(/<form\b([^>]*)>([\s\S]*?)<\/form>/) ?? [];

    expect(body).toMatch(/type="password"/);
    const submits = [...body.matchAll(/<button\b([^>]*)>/g)].map((m) => m[1]).filter((a) => /type="submit"/.test(a));
    expect(submits).toHaveLength(1);
    expect(submits[0]).toMatch(/\bdisabled=""/);
    expect(attrs).not.toMatch(/\baction=/);
  });
});
