import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { LandingPage } from "@/components/home/landing-page"

const render = (signedIn: boolean) => renderToStaticMarkup(createElement(LandingPage, { signedIn }))
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
const ids = (html: string) => new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]))

describe("public landing", () => {
  it("every in-page anchor has a target and account links open real routes", () => {
    const html = render(false)
    const links = hrefs(html)
    for (const anchor of links.filter((h) => h.startsWith("#"))) expect(ids(html).has(anchor.slice(1))).toBe(true)
    expect(links).toEqual(expect.arrayContaining(["/login", "/signup"]))
    expect(links).not.toContain("/dashboard")
  })

  it("signed-in visitors get the dashboard instead of sign-up", () => {
    const links = hrefs(render(true))
    expect(links).toContain("/dashboard")
    expect(links).not.toContain("/signup")
    expect(links).not.toContain("/login")
  })

  it("has no canvas, live-status pills or animated decoration", () => {
    const html = render(false)
    expect(html).not.toMatch(/<canvas|\bONLINE\b|\bACTIVE\b|animate-|Connected Systems/)
    expect(html.match(/<h1/g)).toHaveLength(1)
  })

  it("hero names the four checkpoints in order and labels its preview as sample data", () => {
    const html = render(false)
    const at = ["Check-in", "Train", "Fuel", "Ask Dante"].map((label) => html.indexOf(`>${label}<`))
    expect(at.every((i) => i > 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(html).toContain("not your data")
  })

  it("every hero animation is gated behind prefers-reduced-motion: no-preference", () => {
    const css = readFileSync("components/home/signal-hero.module.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    const gate = css.indexOf("@media (prefers-reduced-motion: no-preference)")
    const end = css.indexOf("@keyframes")
    expect(gate).toBeGreaterThan(-1)
    for (const m of css.matchAll(/animation(-name)?\s*:/g)) {
      expect(m.index).toBeGreaterThan(gate)
      expect(m.index).toBeLessThan(end)
    }
  })
})
