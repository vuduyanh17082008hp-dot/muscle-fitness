import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Ecosystem } from "@/components/experience/motion-home/hero/Ecosystem"
import { MotionFooter } from "@/components/experience/motion-home/sections/MotionFooter"
import { FALLBACK_VIEW_MODEL, HOMEPAGE_ROUTES } from "@/components/experience/motion-home/data/homepageViewModel"

// Landing polish (2026-10-25). Rendered markup only: anchor scrolling, the
// orbit/grid breakpoint swap and touch/cursor behaviour are verified in a real browser.

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
const gridHtml = (html: string) => html.slice(html.indexOf("mt-5 lg:hidden"))

describe("L-01: informational links explore the page, account links open the app", () => {
  it("footer Product column points at landing chapters; Account keeps app routes", () => {
    const links = hrefs(renderToStaticMarkup(createElement(MotionFooter, { routes: HOMEPAGE_ROUTES })))
    expect(links).toEqual(expect.arrayContaining(["#training", "#nutrition", "#recovery", "#dante"]))
    expect(links).toEqual(expect.arrayContaining([HOMEPAGE_ROUTES.dashboard, HOMEPAGE_ROUTES.login, HOMEPAGE_ROUTES.signup]))
    expect(links).not.toContain(HOMEPAGE_ROUTES.training)
    expect(links).not.toContain(HOMEPAGE_ROUTES.chatbot)
  })

  it("anonymous orbit signals link to their chapter, never to a login-gated route", () => {
    const links = hrefs(renderToStaticMarkup(createElement(Ecosystem, { viewModel: FALLBACK_VIEW_MODEL })))
    expect(links.length).toBeGreaterThan(0)
    expect(links.every((href) => href.startsWith("#"))).toBe(true)
  })

  it("signed-in orbit signals keep their live app destinations", () => {
    const viewModel = { ...FALLBACK_VIEW_MODEL, mode: "authenticated" as const }
    const links = hrefs(renderToStaticMarkup(createElement(Ecosystem, { viewModel })))
    expect(links).toContain(HOMEPAGE_ROUTES.training)
    expect(links).toContain(HOMEPAGE_ROUTES.chatbot)
  })
})

describe("L-02: mobile orbital recomposition", () => {
  const html = renderToStaticMarkup(createElement(Ecosystem, { viewModel: FALLBACK_VIEW_MODEL }))

  it("renders all eight signals in the below-lg telemetry grid", () => {
    expect(gridHtml(html)).not.toBe("")
    expect(gridHtml(html).match(/<li>/g)).toHaveLength(8)
  })

  it("keeps the orbiting satellite layer for lg and up only", () => {
    expect(html.match(/data-ecosystem-node/g)).toHaveLength(8)
    expect(html).toMatch(/class="absolute inset-0 hidden pointer-events-none lg:block/)
  })
})
