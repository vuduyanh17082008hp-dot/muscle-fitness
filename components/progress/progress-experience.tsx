"use client"

import { useState } from "react"
import Link from "next/link"
import { Award, Lock, Zap, Clock, TrendingUp, AlertTriangle } from "lucide-react"

import { MotivationLine } from "@/components/motivation/motivation-line"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { CONSISTENCY_STATUS_LABEL, formatKg, formatPoints } from "@/lib/progress/format"
import type { ProgressPageModel } from "@/lib/progress/page-model"
import type { ProgressComparison } from "@/lib/progress/types"
import { ProgressChrome, useProgressReveal } from "@/components/progress/progress-chrome"

import "./progress.css"

const TABS = [
  { label: "Overview", href: "/dashboard/progress#overview" },
  { label: "Strength", href: "/dashboard/training-intelligence" },
  { label: "Body", href: "/dashboard/progress#body" },
  { label: "Progress", href: "/dashboard/progress" },
]

const WEEKDAYS = ["Mon", "Wed", "Fri", "Sun"]

export function ProgressExperience({ model }: { model: ProgressPageModel }) {
  useProgressReveal()
  const empty = model.journey.weeklySnapshots.length === 0

  return (
    <div className="pj-root">
      <ProgressChrome />
      <nav className="tabs" aria-label="Progress">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="tab"
            aria-current={tab.href === "/dashboard/progress" ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {empty ? <EmptyState /> : <Journey model={model} />}
    </div>
  )
}

function Journey({ model }: { model: ProgressPageModel }) {
  const { journey, level } = model
  const stats = journey.currentWeekStats
  const circ = 2 * Math.PI * 78
  const ringMax = Math.max(7, journey.longestStreak, journey.currentStreak, 1)
  const ringTarget = Math.round(circ * Math.min(1, journey.currentStreak / ringMax))

  return (
    <>
      <section id="overview" className="glass card-spot border-glow rounded-3xl p-8 md:p-10 mb-6 reveal relative overflow-hidden" data-tilt>
        <span className="hud-corner hud-tl" />
        <span className="hud-corner hud-tr" />
        <span className="hud-corner hud-bl" />
        <span className="hud-corner hud-br" />
        <div className="grid items-center gap-8 md:grid-cols-12">
          <div className="flex justify-center md:col-span-3">
            <div className="relative h-[180px] w-[180px]">
              <svg viewBox="0 0 180 180" className="h-full w-full" aria-hidden="true">
                <defs>
                  <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#4ade80" />
                    <stop offset="50%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
                <circle cx="90" cy="90" r="78" fill="none" stroke="rgba(74,222,128,0.10)" strokeWidth="8" />
                <g className="ring-progress" style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}>
                  <circle
                    cx="90"
                    cy="90"
                    r="78"
                    fill="none"
                    stroke="url(#ringGrad)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${ringTarget} 500`}
                    className="ring-fill"
                  />
                </g>
                <circle cx="90" cy="90" r="92" fill="none" stroke="rgba(74,222,128,0.15)" strokeWidth="1" strokeDasharray="1 8" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[10px] uppercase tracking-[0.25em]" style={{ color: "var(--text-dim)" }}>Streak</div>
                <div className="text-4xl font-bold tracking-tight">
                  <AnimatedNumber value={journey.currentStreak} />
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  <span className="flame" aria-hidden="true">🔥</span> days
                </div>
              </div>
              <p className="sr-only">Consistency streak {journey.currentStreak} days. Longest {journey.longestStreak}.</p>
            </div>
          </div>

          <div className="md:col-span-6">
            <span className="s-title">Your journey</span>
            <h1 className="mt-3 text-4xl font-bold leading-[1.05] tracking-tight md:text-5xl">
              <span className="grad-text">Week {journey.currentWeek}</span>
            </h1>
            <p className="mt-3 text-[16px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{model.sentence}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="mr-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>This week</span>
              {model.weekDots.map((dot) => (
                <span key={dot.date} className={`week-dot ${dot.kind}`} title={dot.title}>{dot.label}</span>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <MiniStat label="Adherence" value={stats.adherence !== undefined ? `${stats.adherence}%` : "—"} hint={model.adherenceDelta !== null ? `${formatPoints(model.adherenceDelta)} vs W1` : "This week"} up={model.adherenceDelta !== null && model.adherenceDelta > 0} />
              <MiniStat label="Sessions" value={String(stats.completedSessions)} hint={`of ${stats.plannedSessions} planned`} />
              <MiniStat label="Volume" value={stats.trainingVolume !== undefined ? formatKg(stats.trainingVolume) : "—"} hint={model.volumeDeltaPercent !== null ? `${model.volumeDeltaPercent > 0 ? "+" : ""}${model.volumeDeltaPercent}% vs last week` : "Logged volume"} up={model.volumeDeltaPercent !== null && model.volumeDeltaPercent > 0} />
            </div>
          </div>

          <div className="space-y-3 md:col-span-3">
            <article className="card-spot rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "rgba(10,22,34,0.5)" }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Level</span>
                <span className="mono text-[11px] text-[#4ade80]">LVL {level.level}</span>
              </div>
              <div className="mb-2 text-sm font-semibold">{level.title}</div>
              <div className="level-bar"><div className="level-bar-fill" data-w={level.progressPercent} /></div>
              <div className="mt-2 text-[10px]" style={{ color: "var(--text-dim)" }}>
                {level.currentXp} / {level.nextLevelXp} XP to LVL {Math.min(5, level.level + 1)}
              </div>
            </article>
            {model.next ? (
              <article className="card-spot rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "rgba(10,22,34,0.5)" }}>
                <div className="mb-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Next milestone</div>
                <div className="text-sm font-semibold">
                  {model.next.title} → <span className="text-[#4ade80]">{model.next.current}/{model.next.target}</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: "rgba(74,222,128,0.1)" }}>
                  <div className="level-bar-fill" data-w={Math.min(100, (model.next.current / model.next.target) * 100)} />
                </div>
              </article>
            ) : null}
          </div>
        </div>
      </section>

      {model.insights.length > 0 ? (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 reveal">
          {model.insights.map((insight) => (
            <article key={insight.id} className="glass flex items-center gap-3 rounded-2xl p-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)" }}>
                {insight.id === "best_day" ? <Zap className="h-5 w-5 text-[#4ade80]" /> : null}
                {insight.id === "most_missed" ? <AlertTriangle className="h-5 w-5 text-[#fbbf24]" /> : null}
                {insight.id === "avg_session" ? <Clock className="h-5 w-5 text-[#22d3ee]" /> : null}
                {insight.id === "trend" ? <TrendingUp className="h-5 w-5 text-[#a78bfa]" /> : null}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{insight.label}</div>
                <div className="truncate text-sm font-semibold">{insight.value}</div>
                <div className={`text-[10px] ${insight.tone === "good" ? "delta-up" : ""}`}>{insight.detail}</div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <section className="glass mb-6 rounded-3xl p-6 reveal md:p-8" aria-labelledby="heat-h">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="s-title">Consistency</span>
            <h2 id="heat-h" className="mt-2 text-2xl font-bold tracking-tight">Last 12 weeks</h2>
            <p className="mt-1 text-[16px]" style={{ color: "var(--text-muted)" }}>Each cell shows how closely you followed the plan.</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="mono flex flex-col justify-around py-1 text-[9px]" style={{ color: "var(--text-dim)" }}>
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="heatmap flex-1" role="img" aria-label="Twelve-week consistency heatmap">
            {Array.from({ length: 12 }, (_, col) =>
              Array.from({ length: 7 }, (__, row) => {
                const day = model.heatmapDays[col * 7 + row]
                if (!day) return null
                return (
                  <span
                    key={day.date}
                    className={`hm-cell${day.date === model.localDate ? " today" : ""}`}
                    data-status={day.status}
                    title={`${day.date} — ${CONSISTENCY_STATUS_LABEL[day.status]}`}
                  />
                )
              }),
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <div className="flex flex-wrap gap-5">
            <span><b className="text-white">{model.heatmap.trainingDays}</b> training</span>
            <span><b className="text-white">{model.heatmap.missedDays}</b> missed</span>
            <span><b className="text-white">{model.heatmap.restDays}</b> rest</span>
          </div>
          {model.heatmap.note ? <span className="insight-pill warn">{model.heatmap.note}</span> : null}
        </div>
      </section>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <section className="glass card-spot rounded-3xl p-6 reveal md:p-7">
          <span className="s-title">This week&apos;s rhythm</span>
          <h3 className="mt-2 text-xl font-bold tracking-tight">Where your work landed</h3>
          {model.rhythm.length > 0 ? (
            <div className="mt-5 space-y-4">
              {model.rhythm.map((row) => (
                <div key={row.label}>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span style={{ color: "var(--text-muted)" }}>{row.label}</span>
                    <span className="mono font-semibold">{row.percent}%</span>
                  </div>
                  <div className="bar-track h-2"><div className="bar-fill" data-w={row.percent} /></div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[16px]" style={{ color: "var(--text-muted)" }}>No planned sessions logged for this week yet.</p>
          )}
          {model.rhythmNote ? <p className="mt-6 border-t pt-5 text-[15px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>{model.rhythmNote}</p> : null}
        </section>

        <section className="glass card-spot rounded-3xl p-6 reveal md:p-7">
          <span className="s-title">Muscle volume</span>
          <h3 className="mt-2 text-xl font-bold tracking-tight">Focus balance</h3>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-dim)" }}>Last 30 days · relative allocation</p>
          {model.muscle ? <MuscleRadar muscle={model.muscle} /> : (
            <p className="mt-6 text-[16px]" style={{ color: "var(--text-muted)" }}>More logged sessions are needed before muscle-focus balance can be estimated.</p>
          )}
        </section>
      </div>

      <section className="glass mb-6 rounded-3xl p-6 reveal md:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="s-title">Milestones</span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">What you&apos;ve unlocked</h2>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span style={{ color: "var(--text-muted)" }}>
              <span className="font-semibold text-[#4ade80]">{model.catalog.filter((item) => item.unlocked).length}</span> of {model.catalog.length}
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full" style={{ background: "rgba(74,222,128,0.1)" }}>
              <div className="level-bar-fill" data-w={model.catalog.length ? Math.round((model.catalog.filter((item) => item.unlocked).length / model.catalog.length) * 100) : 0} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 md:grid-cols-6">
          {model.catalog.map((item) => (
            <MilestoneBadge key={item.type} item={item} />
          ))}
        </div>
      </section>

      <section className="glass mb-6 rounded-3xl p-6 reveal md:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="s-title">Personal records</span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">Lifetime bests</h2>
          </div>
          <span className="mono rounded-md px-2.5 py-1 text-xs" style={{ background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)" }}>
            {model.personalRecords.length} lift{model.personalRecords.length === 1 ? "" : "s"} tracked
          </span>
        </div>
        {model.personalRecords.length > 0 ? (
          <div className="space-y-1">
            {model.personalRecords.map((record) => (
              <article key={record.exerciseId} className="pr-row grid items-center gap-3 border-b py-3 md:grid-cols-12" style={{ borderColor: "var(--border)" }}>
                <div className="md:col-span-5">
                  <div className="text-sm font-semibold">{record.exerciseName}</div>
                  <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>{record.metric}</div>
                </div>
                <div className="mono text-sm md:col-span-2" style={{ color: "var(--text-muted)" }}>{record.achievedAt}</div>
                <div className="mono text-sm line-through md:col-span-2" style={{ color: "var(--text-dim)" }}>
                  {record.previousKg !== null ? `${record.previousKg} kg` : "—"}
                </div>
                <div className="mono text-lg font-bold text-[#4ade80] md:col-span-2">{record.currentKg} kg</div>
                <div className="delta-up text-right text-xs font-semibold md:col-span-1">
                  {record.deltaKg !== null ? `+${record.deltaKg}` : ""}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>Logged working sets are needed before estimated 1RMs can appear.</p>
        )}
      </section>

      {model.journey.thenVsNow.length > 0 ? (
        <section className="glass mb-6 rounded-3xl p-6 reveal md:p-8">
          <span className="s-title">Then vs now</span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">{model.thenVsNowRange}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {model.journey.thenVsNow.map((item) => <CompareCard key={item.metricId} item={item} />)}
          </div>
        </section>
      ) : null}

      <section className="glass mb-6 rounded-3xl p-6 reveal md:p-8">
        <span className="s-title">Today&apos;s fuel</span>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">Macros</h2>
        {model.nutrition.unavailable ? (
          <p className="mt-4" style={{ color: "var(--text-muted)" }}>Nutrition history couldn&apos;t be loaded.</p>
        ) : model.nutrition.available ? (
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {model.nutrition.rings.map((ring, index) => <MacroCard key={ring.label} {...ring} color={["#4ade80", "#22d3ee", "#a78bfa", "#fbbf24"][index]} />)}
          </div>
        ) : (
          <p className="mt-4 text-[16px]" style={{ color: "var(--text-muted)" }}>No food logged today yet.</p>
        )}
      </section>

      <section id="body" className="glass mb-6 scroll-mt-24 rounded-3xl p-6 reveal md:p-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <span className="s-title">Body metrics</span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">Current</h2>
          </div>
          <Link href="/account/edit" className="btn-secondary inline-flex items-center">Edit</Link>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <BodyTile label="Weight" value={model.body.weightKg !== null ? String(model.body.weightKg) : "—"} unit="kg" />
          <BodyTile label="Height" value={model.body.heightCm !== null ? String(model.body.heightCm) : "—"} unit="cm" />
          <BodyTile label="BMI" value={model.body.bmi !== null ? String(model.body.bmi) : "—"} note="A calculated ratio, not a diagnosis." />
          <BodyTile label="Goal" value={model.body.goal ?? "—"} />
        </div>
      </section>

      <section className="dante-card mb-6 p-6 md:p-8">
        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-start">
          <div className="dante-avatar grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-lg font-bold text-[#04121a]">D</div>
          <div className="flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-muted)" }}>Dante</span>
              <span className="mono rounded-md px-2 py-0.5 text-[10px]" style={{ background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)" }}>
                Week {journey.currentWeek} snapshot
              </span>
            </div>
            <p className="text-[16px] leading-relaxed text-white">{journey.groundedSummary}</p>
            {journey.summaryEvidence.length > 0 ? (
              <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {journey.summaryEvidence.map((item) => item.statement).join(" ")}
              </p>
            ) : null}
            <MotivationLine contexts={model.motivationContexts} localDate={model.localDate} className="serif mt-3 text-[15px] leading-relaxed text-white" />
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/dashboard/training-intelligence" className="btn-secondary inline-flex items-center">Training intelligence</Link>
              <Link href="/dashboard/recovery" className="btn-secondary inline-flex items-center">Recovery trends</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

function EmptyState() {
  return (
    <section className="glass empty-cta reveal flex flex-col items-start gap-4 md:flex-row md:items-center">
      <div>
        <div className="font-semibold text-white">Nothing to compare yet — and that&apos;s fine.</div>
        <p className="mt-1 text-[16px]" style={{ color: "var(--text-muted)" }}>
          Log your first sessions and check-ins. We&apos;ll build your baseline as enough history becomes available.
        </p>
      </div>
      <Link href="/dashboard" className="btn-primary inline-flex shrink-0 items-center">Log first session</Link>
    </section>
  )
}

function MiniStat({ label, value, hint, up }: { label: string; value: string; hint: string; up?: boolean }) {
  return (
    <div className="card-spot rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "rgba(10,22,34,0.5)" }}>
      <div className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{label}</div>
      <div className={`text-xl font-bold ${label === "Adherence" ? "text-[#4ade80]" : ""}`}>
        <AnimatedNumber value={value} />
      </div>
      <div className={`mt-0.5 text-[10px] ${up ? "delta-up" : ""}`} style={up ? undefined : { color: "var(--text-dim)" }}>{hint}</div>
    </div>
  )
}

function MuscleRadar({ muscle }: { muscle: NonNullable<ProgressPageModel["muscle"]> }) {
  const r = 90
  const points = muscle.groups.map((group, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / muscle.groups.length
    const radius = group.share * r
    return `${Math.cos(angle) * radius},${Math.sin(angle) * radius}`
  })
  return (
    <>
      <div className="flex justify-center">
        <svg viewBox="-110 -110 220 220" className="h-[240px] w-[240px]" aria-hidden="true">
          <g className="radar-grid">
            <polygon points="0,-90 78,-45 78,45 0,90 -78,45 -78,-45" />
            <polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30" />
            <polygon points="0,-30 26,-15 26,15 0,30 -26,15 -26,-15" />
          </g>
          <polygon className="radar-data" points={points.join(" ")} />
          <g className="radar-dot">
            {muscle.groups.map((group, index) => {
              const angle = -Math.PI / 2 + (index * 2 * Math.PI) / muscle.groups.length
              return <circle key={group.label} cx={Math.cos(angle) * group.share * r} cy={Math.sin(angle) * group.share * r} r="3" />
            })}
          </g>
          <g fontSize="9" fill="#7f95ad" fontFamily="JetBrains Mono" textAnchor="middle">
            {muscle.groups.map((group, index) => {
              const angle = -Math.PI / 2 + (index * 2 * Math.PI) / muscle.groups.length
              return <text key={group.label} x={Math.cos(angle) * 102} y={Math.sin(angle) * 102}>{group.label.toUpperCase()}</text>
            })}
          </g>
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div className="flex justify-between rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
          <span style={{ color: "var(--text-muted)" }}>Most trained</span>
          <span className="font-semibold text-[#4ade80]">{muscle.mostTrained}</span>
        </div>
        <div className="flex justify-between rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
          <span style={{ color: "var(--text-muted)" }}>Least trained</span>
          <span className="font-semibold text-[#fbbf24]">{muscle.leastTrained}</span>
        </div>
        <div className="flex justify-between rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
          <span style={{ color: "var(--text-muted)" }}>Balance</span>
          <span className="font-semibold">Relative</span>
        </div>
      </div>
    </>
  )
}

function MilestoneBadge({ item }: { item: ProgressPageModel["catalog"][number] }) {
  const [open, setOpen] = useState(false)
  return (
    <button type="button" data-ms className={`ms-badge flex flex-col items-center text-center ${item.unlocked ? "unlocked" : "locked"}`} onClick={() => setOpen((value) => !value)}>
      <div className="ms-icon mb-2 grid h-14 w-14 place-items-center rounded-2xl" style={{ background: item.unlocked ? "rgba(74,222,128,0.1)" : "rgba(80,100,120,0.1)", border: `1px solid ${item.unlocked ? "rgba(74,222,128,0.3)" : "var(--border)"}` }}>
        {item.unlocked ? <Award className="h-6 w-6 text-[#4ade80]" /> : <Lock className="h-6 w-6" style={{ color: "var(--text-dim)" }} />}
      </div>
      <div className="text-[11px] font-semibold">{item.title}</div>
      <div className="mono text-[10px]" style={{ color: "var(--text-dim)" }}>{item.unlocked ? item.unlocked.achievedAt.slice(0, 10) : "Locked"}</div>
      {open ? <p className="mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>{item.unlocked?.displayData.description ?? item.description}</p> : null}
    </button>
  )
}

function CompareCard({ item }: { item: ProgressComparison }) {
  const path = sparkPath(item.series ?? [item.thenValue, item.nowValue])
  return (
    <article className="card-spot rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "rgba(10,22,34,0.4)" }}>
      <div className="mb-3 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{item.label}</div>
      <div className="flex items-baseline gap-4">
        <div>
          <div className="text-[10px] uppercase" style={{ color: "var(--text-dim)" }}>{item.thenLabel}</div>
          <div className="text-3xl font-bold" style={{ color: "var(--text-dim)" }}>{item.thenValue}{item.unit ?? ""}</div>
        </div>
        <span aria-hidden="true" className="text-[#4ade80]">→</span>
        <div>
          <div className="text-[10px] uppercase" style={{ color: "var(--text-dim)" }}>{item.nowLabel}</div>
          <div className="glow-green text-3xl font-bold text-[#4ade80]">{item.nowValue}{item.unit ?? ""}</div>
        </div>
      </div>
      <svg viewBox="0 0 200 40" className="mt-4 h-10 w-full" preserveAspectRatio="none" aria-hidden="true">
        <path className="spark" data-spark d={path} />
      </svg>
      {item.delta !== undefined ? (
        <div className="delta-up mt-2 text-xs font-semibold">
          {item.deltaKind === "points" ? `${formatPoints(item.delta)} vs ${item.thenLabel}` : item.deltaKind === "percent" ? `${item.delta > 0 ? "+" : ""}${item.delta}% vs ${item.thenLabel}` : `${item.delta > 0 ? "+" : ""}${item.delta} since ${item.thenLabel}`}
        </div>
      ) : null}
    </article>
  )
}

function MacroCard({ label, consumed, target, unit, color }: { label: string; consumed: number; target: number | null; unit: string; color: string }) {
  const pct = target && target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0
  const dash = (pct / 100) * 163
  return (
    <article className="card-spot flex items-center gap-4 rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "rgba(10,22,34,0.4)" }}>
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 60 60" className="h-full w-full" style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
          <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(74,222,128,0.12)" strokeWidth="5" />
          <circle cx="30" cy="30" r="26" fill="none" stroke={color} strokeWidth="5" strokeDasharray={`${dash} 200`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 grid place-items-center font-mono text-[11px] font-bold" style={{ color }}>{pct}%</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{label}</div>
        <div className="text-2xl font-bold"><AnimatedNumber value={consumed} /></div>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{target !== null ? `of ${target} ${unit}` : unit}</div>
      </div>
    </article>
  )
}

function BodyTile({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <article className="card-spot rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "rgba(10,22,34,0.4)" }}>
      <div className="mb-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight">{value}</span>
        {unit ? <span className="text-sm" style={{ color: "var(--text-muted)" }}>{unit}</span> : null}
      </div>
      {note ? <div className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>{note}</div> : null}
    </article>
  )
}

function sparkPath(values: number[]) {
  if (values.length === 0) return "M0,20 L200,20"
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 200
      const y = 34 - ((value - min) / span) * 28
      return `${index === 0 ? "M" : "L"}${x},${y}`
    })
    .join(" ")
}
