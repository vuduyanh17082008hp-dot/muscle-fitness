"use client"

import { useEffect, useRef } from "react"

export function ProgressChrome() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spotRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const coarse = window.matchMedia("(hover: none), (pointer: coarse)").matches
    const root = document.querySelector(".pj-root")
    let alive = true
    let raf = 0

    function onScroll() {
      const bar = barRef.current
      if (!bar) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      bar.style.width = `${Math.min(100, (window.scrollY / Math.max(1, max)) * 100)}%`
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()

    if (!reduce && canvasRef.current) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      if (ctx && !coarse) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        let w = 0
        let h = 0
        let particles: Array<{ x: number; y: number; r: number; vx: number; vy: number; a: number; hue: number }> = []
        const resize = () => {
          w = window.innerWidth
          h = window.innerHeight
          canvas.width = w * dpr
          canvas.height = h * dpr
          canvas.style.width = `${w}px`
          canvas.style.height = `${h}px`
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          const count = Math.min(40, Math.floor((w * h) / 36000))
          particles = Array.from({ length: count }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: Math.random() * 1.3 + 0.3,
            vx: (Math.random() - 0.5) * 0.12,
            vy: (Math.random() - 0.5) * 0.12,
            a: Math.random() * 0.4 + 0.15,
            hue: Math.random() < 0.6 ? 142 : Math.random() < 0.5 ? 186 : 262,
          }))
        }
        const tick = () => {
          if (!alive) return
          ctx.clearRect(0, 0, w, h)
          for (const p of particles) {
            p.x += p.vx
            p.y += p.vy
            if (p.x < 0) p.x = w
            if (p.x > w) p.x = 0
            if (p.y < 0) p.y = h
            if (p.y > h) p.y = 0
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
            ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${p.a})`
            ctx.fill()
          }
          raf = requestAnimationFrame(tick)
        }
        resize()
        tick()
        window.addEventListener("resize", resize, { passive: true })
      }
    }

    if (!reduce && !coarse && spotRef.current) {
      const spot = spotRef.current
      let mx = window.innerWidth / 2
      let my = window.innerHeight / 2
      let cx = mx
      let cy = my
      const onMove = (event: MouseEvent) => {
        mx = event.clientX
        my = event.clientY
        spot.style.opacity = "1"
      }
      const loop = () => {
        if (!alive) return
        cx += (mx - cx) * 0.1
        cy += (my - cy) * 0.1
        spot.style.left = `${cx}px`
        spot.style.top = `${cy}px`
        requestAnimationFrame(loop)
      }
      window.addEventListener("mousemove", onMove, { passive: true })
      loop()
    }

    if (!reduce && !coarse && dotRef.current && ringRef.current && root) {
      root.classList.add("pj-cursor-on")
      const dot = dotRef.current
      const ring = ringRef.current
      let mx = 0
      let my = 0
      let rx = 0
      let ry = 0
      const onMove = (event: MouseEvent) => {
        mx = event.clientX
        my = event.clientY
        dot.style.left = `${mx}px`
        dot.style.top = `${my}px`
      }
      const loop = () => {
        if (!alive) return
        rx += (mx - rx) * 0.2
        ry += (my - ry) * 0.2
        ring.style.left = `${rx}px`
        ring.style.top = `${ry}px`
        requestAnimationFrame(loop)
      }
      const enter = () => root.classList.add("cursor-hover")
      const leave = () => root.classList.remove("cursor-hover")
      window.addEventListener("mousemove", onMove, { passive: true })
      root.querySelectorAll("a, button, .glass, .card-spot, .pr-row").forEach((el) => {
        el.addEventListener("mouseenter", enter)
        el.addEventListener("mouseleave", leave)
      })
      loop()
    }

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", onScroll)
    }
  }, [])

  return (
    <>
      <div className="pj-bg-base" aria-hidden="true" />
      <div className="pj-bg-grid" aria-hidden="true" />
      <div className="pj-bg-noise" aria-hidden="true" />
      <div className="pj-aurora" aria-hidden="true">
        <div className="pj-orb pj-orb-1" />
        <div className="pj-orb pj-orb-2" />
        <div className="pj-orb pj-orb-3" />
      </div>
      <canvas ref={canvasRef} className="pj-particles" aria-hidden="true" />
      <div ref={spotRef} className="pj-spotlight" aria-hidden="true" />
      <div ref={barRef} className="pj-scroll" aria-hidden="true" />
      <div ref={ringRef} className="pj-cursor-ring" aria-hidden="true" />
      <div ref={dotRef} className="pj-cursor-dot" aria-hidden="true" />
    </>
  )
}

export function useProgressReveal() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const root = document.querySelector(".pj-root")
    if (!root) return
    const mark = (selector: string, cls: string, stagger = 0) => {
      const nodes = root.querySelectorAll(selector)
      if (reduce) {
        nodes.forEach((node) => node.classList.add(cls))
        return
      }
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return
            if (stagger) {
              nodes.forEach((node, index) => {
                window.setTimeout(() => node.classList.add(cls), index * stagger)
              })
            } else {
              entry.target.classList.add(cls)
            }
            io.unobserve(entry.target)
          })
        },
        { threshold: 0.12 },
      )
      if (stagger && nodes[0]) io.observe(nodes[0])
      else nodes.forEach((node) => io.observe(node))
    }
    mark(".reveal", "in-view")
    mark(".hm-cell", "revealed", 8)
    mark("[data-ms]", "revealed", 60)
    mark(".radar-data", "draw")
    mark(".radar-dot", "revealed")
    mark("[data-spark]", "drawn")

    const bars = root.querySelectorAll<HTMLElement>("[data-w]")
    const barIo = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        const el = entry.target as HTMLElement
        el.style.width = `${el.dataset.w}%`
        barIo.unobserve(el)
      })
    }, { threshold: 0.3 })
    bars.forEach((bar) => {
      if (reduce) bar.style.width = `${bar.dataset.w}%`
      else barIo.observe(bar)
    })

    const spots = root.querySelectorAll<HTMLElement>(".card-spot")
    const onSpot = (event: Event) => {
      const e = event as MouseEvent
      const card = e.currentTarget as HTMLElement
      const rect = card.getBoundingClientRect()
      card.style.setProperty("--mx", `${e.clientX - rect.left}px`)
      card.style.setProperty("--my", `${e.clientY - rect.top}px`)
    }
    spots.forEach((card) => card.addEventListener("mousemove", onSpot))

    const hero = root.querySelector<HTMLElement>("[data-tilt]")
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches
    const onTilt = (event: MouseEvent) => {
      if (!hero || reduce || !fine) return
      const rect = hero.getBoundingClientRect()
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1
      hero.style.transform = `perspective(1200px) rotateX(${(-ny * 2).toFixed(2)}deg) rotateY(${(nx * 3).toFixed(2)}deg)`
    }
    const resetTilt = () => {
      if (hero) hero.style.transform = ""
    }
    hero?.addEventListener("mousemove", onTilt)
    hero?.addEventListener("mouseleave", resetTilt)

    return () => {
      spots.forEach((card) => card.removeEventListener("mousemove", onSpot))
      hero?.removeEventListener("mousemove", onTilt)
      hero?.removeEventListener("mouseleave", resetTilt)
    }
  }, [])
}
