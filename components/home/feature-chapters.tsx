import type { ReactNode } from "react";

import { MuscleMap, type MuscleInvolvement, type MuscleMapHighlights } from "@/components/training/muscle-map";
import { cn } from "@/lib/cn";
import { findAlternatives, findCatalogueExercise } from "@/lib/training/exercise-substitution";
import { MUSCLE_DISPLAY_NAME, resolveCanonicalMuscle } from "@/lib/training/muscle-taxonomy";

/**
 * Landing "Inside the app" chapters. Every claim maps to a shipped route or
 * component (see the feature-claim map in the homepage hand-off). Previews
 * are static sample compositions labelled as such — except the anatomy map
 * and the alternatives list, which are the real MuscleMap component and the
 * real substitution engine run on the real catalogue entry for bench press.
 */

const card =
  "rounded-2xl border border-[var(--mf-pub-border-strong)] bg-mf-pub-surface-elevated shadow-[var(--shadow-card)]";
const kicker = "text-xs font-semibold uppercase tracking-[0.14em] text-mf-pub-text-muted tabular-nums";

function Chapter({
  id,
  index,
  label,
  title,
  body,
  points,
  preview,
  flip = false,
}: {
  id: string;
  index: number;
  label: string;
  title: string;
  body: ReactNode;
  points: string[];
  preview: ReactNode;
  flip?: boolean;
}) {
  return (
    <article
      aria-labelledby={id}
      className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16"
    >
      <div className={cn(flip && "lg:order-2")}>
        <p className={kicker}>
          {String(index).padStart(2, "0")} · {label}
        </p>
        <h3
          id={id}
          className="mt-3 text-balance font-heading text-3xl font-black uppercase leading-[0.95] tracking-tight text-mf-pub-text sm:text-4xl"
        >
          {title}
        </h3>
        <p className="mt-4 max-w-[52ch] text-pretty text-base leading-7 text-mf-pub-text-secondary">
          {body}
        </p>
        <ul className="mt-5 space-y-2.5 text-[15px] leading-6 text-mf-pub-text-secondary">
          {points.map((point) => (
            <li key={point} className="flex gap-3">
              <span aria-hidden="true" className="mt-[9px] h-[2px] w-3 shrink-0 bg-mf-pub-text" />
              {point}
            </li>
          ))}
        </ul>
      </div>
      <figure className="min-w-0">
        <figcaption className="mb-3 text-xs font-medium text-mf-pub-text-muted">
          Sample · not your data
        </figcaption>
        {preview}
      </figure>
    </article>
  );
}

/* ---------- previews (decorative; the copy beside each carries the meaning) ---------- */

function TodayPreview() {
  const items = [
    ["Upper body A", "Today's session · 5 exercises", "Start"],
    ["Log dinner", "1,420 of 2,450 kcal so far", "Add"],
    ["Check-in", "Done · readiness 78", "View"],
  ];
  return (
    <div aria-hidden="true" className={cn(card, "border-2 border-mf-pub-text p-4 sm:p-5")}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-heading text-2xl font-black uppercase text-mf-pub-text">What matters now</p>
      </div>
      <ul className="mt-4 divide-y divide-[var(--mf-pub-border)] rounded-xl border border-[var(--mf-pub-border)]">
        {items.map(([title, sub, action]) => (
          <li key={title} className="flex items-center justify-between gap-3 px-3 py-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-mf-pub-text">{title}</span>
              <span className="block text-xs tabular-nums text-mf-pub-text-muted">{sub}</span>
            </span>
            <span className="shrink-0 rounded-lg border border-mf-pub-text px-2.5 py-1 text-xs font-semibold text-mf-pub-text">
              {action}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[11px] tabular-nums text-mf-pub-text-muted">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="flex flex-col items-center gap-1.5">
            {d}
            <span
              className={cn(
                "block size-2.5 rounded-full border border-mf-pub-text",
                i < 2 && "bg-mf-pub-text",
                i === 2 && "bg-mf-brand",
                i === 4 && "border-dashed",
              )}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

function LogbookPreview() {
  const sets = [
    [1, "80", "8", true],
    [2, "80", "7", true],
    [3, "80", "6", true],
    [4, "80", "", false],
  ] as const;
  return (
    <div aria-hidden="true" className={cn(card, "overflow-hidden")}>
      <div className="flex items-center justify-between gap-3 border-b-2 border-mf-pub-text bg-mf-pub-bg px-4 py-3">
        <p className="font-heading text-xl font-black uppercase text-mf-pub-text">Bench press</p>
        <span className="rounded-lg bg-mf-pub-text px-2.5 py-1 text-xs font-semibold tabular-nums text-mf-pub-bg">
          Rest 1:45
        </span>
      </div>
      <p className="border-b border-[var(--mf-pub-border)] px-4 py-2.5 text-xs tabular-nums text-mf-pub-text-secondary">
        <span className="font-semibold text-mf-training">Last time</span> · 77.5 kg × 8, 8, 7, 6
      </p>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-mf-pub-text-muted">
            <th className="px-4 py-2 font-medium">Set</th>
            <th className="py-2 font-medium">kg</th>
            <th className="py-2 font-medium">Reps</th>
            <th className="px-4 py-2 text-right font-medium">Saved</th>
          </tr>
        </thead>
        <tbody>
          {sets.map(([n, kg, reps, done]) => (
            <tr key={n} className="border-t border-[var(--mf-pub-border)]">
              <td className="px-4 py-2.5 font-semibold text-mf-pub-text">{n}</td>
              <td className="py-2.5 text-mf-pub-text">{kg}</td>
              <td className="py-2.5 text-mf-pub-text">
                {reps || <span className="inline-block h-5 w-8 rounded border border-dashed border-[var(--mf-pub-border-strong)] align-middle" />}
              </td>
              <td className="px-4 py-2.5 text-right">
                <span
                  className={cn(
                    "inline-block size-3 rounded-full border border-mf-pub-text",
                    done && "bg-mf-brand",
                  )}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const INPUTS = [
  ["Search", "USDA · Open Food Facts"],
  ["Scan barcode", "Packaged food"],
  ["Food photo", "Estimate you review"],
  ["HawkerLens SG", "Scan a hawker dish"],
  ["Vietnamese dish", "Phở, bún chả, cơm tấm…"],
  ["Menu photo", "Pick an order — logs nothing"],
  ["Manual entry", "Your own values"],
];

function NutritionPreview() {
  return (
    <div aria-hidden="true" className="grid gap-3">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {INPUTS.map(([name, hint], i) => (
          <li
            key={name}
            className={cn(
              card,
              "min-w-0 px-3 py-2.5",
              i === 0 && "col-span-2 border-2 border-mf-pub-text sm:col-span-3",
            )}
          >
            <span className="block text-sm font-semibold leading-tight text-mf-pub-text">{name}</span>
            <span className="mt-0.5 block text-xs leading-snug text-mf-pub-text-muted">{hint}</span>
          </li>
        ))}
      </ul>
      <div className={cn(card, "px-4 py-3")}>
        <p className="text-xs font-medium text-mf-pub-text-muted">Dante · meal draft</p>
        <p className="mt-1 text-sm leading-6 text-mf-pub-text">
          Grilled salmon, rice, greens — <span className="tabular-nums">610 kcal · 41 g protein</span>
        </p>
        <p className="mt-2 flex gap-2 text-xs font-semibold">
          <span className="rounded-lg bg-mf-brand px-2.5 py-1 text-mf-brand-ink">Confirm &amp; log</span>
          <span className="rounded-lg border border-[var(--mf-pub-border-strong)] px-2.5 py-1 text-mf-pub-text-secondary">Edit</span>
        </p>
      </div>
    </div>
  );
}

function RecoveryPreview() {
  const ratings = [
    ["Sleep quality", 7],
    ["Stress", 4],
    ["Fatigue", 3],
    ["Soreness", 4],
    ["Mood", 7],
    ["Readiness to train", 8],
  ] as const;
  const trend = [64, 70, 68, 74, 71, 76, 78];
  const x = (i: number) => 4 + i * 32;
  const y = (v: number) => 44 - ((v - 60) / 20) * 36;
  return (
    <div aria-hidden="true" className={cn(card, "grid gap-5 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:p-5")}>
      <ul className="space-y-2.5">
        {ratings.map(([name, value]) => (
          <li key={name} className="text-xs text-mf-pub-text-secondary">
            <span className="flex justify-between">
              {name}
              <span className="tabular-nums text-mf-pub-text">{value}/10</span>
            </span>
            <span className="mt-1 block h-1 rounded-full bg-[var(--mf-pub-border)]">
              <span className="block h-full rounded-full bg-mf-pub-text" style={{ width: `${value * 10}%` }} />
            </span>
          </li>
        ))}
        <li className="flex justify-between border-t border-[var(--mf-pub-border)] pt-2.5 text-xs text-mf-pub-text-secondary">
          Pain or illness <span className="font-semibold text-mf-pub-text">No</span>
        </li>
      </ul>
      <div className="flex flex-col justify-between gap-4 sm:border-l sm:border-[var(--mf-pub-border)] sm:pl-5">
        <div>
          <p className="text-xs text-mf-pub-text-muted">Readiness</p>
          <p className="font-heading text-5xl font-black leading-none tabular-nums text-mf-pub-text">78</p>
          <p className="mt-1 text-xs text-mf-pub-text-secondary">Ready to train</p>
        </div>
        <div>
          <svg viewBox="0 0 200 48" className="h-12 w-full" preserveAspectRatio="none">
            <polyline
              points={trend.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke="var(--mf-pub-text)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x(6)} cy={y(78)} r="4" fill="var(--mf-brand)" stroke="var(--mf-pub-text)" strokeWidth="1.5" />
          </svg>
          <p className="mt-1 text-xs text-mf-pub-text-muted">Last seven days</p>
        </div>
      </div>
    </div>
  );
}

function DantePreview() {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border border-[var(--dante-border)] bg-[var(--dante-fill)] p-4 shadow-[var(--shadow-card)] sm:p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mf-assistant">Today context</p>
      <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {["Check-in done", "Upper body A · not started", "1,420 kcal logged"].map((chip) => (
          <span key={chip} className="rounded-full border border-[var(--dante-border)] bg-mf-pub-surface px-2.5 py-1 text-mf-pub-text-secondary">
            {chip}
          </span>
        ))}
      </p>
      <div className="mt-4 space-y-3 text-sm leading-6">
        <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-mf-pub-text px-3.5 py-2.5 text-mf-pub-bg">
          Shoulder feels a bit tight. Should I still press today?
        </p>
        <p className="max-w-[90%] rounded-2xl rounded-bl-md border border-[var(--dante-border)] bg-mf-pub-surface px-3.5 py-2.5 text-mf-pub-text">
          <span className="font-semibold text-mf-assistant">Dante</span> · Your check-in reads normal and you
          didn&apos;t flag pain. One option: fewer pressing sets today and see how it feels.
        </p>
      </div>
      <div className="mt-3 rounded-xl border border-mf-pub-text bg-mf-pub-surface px-3.5 py-3">
        <p className="text-xs text-mf-pub-text-muted">Proposed change</p>
        <p className="text-sm font-semibold tabular-nums text-mf-pub-text">Bench press · 4 sets → 3 sets</p>
        <p className="mt-2 flex gap-2 text-xs font-semibold">
          <span className="rounded-lg bg-mf-brand px-2.5 py-1 text-mf-brand-ink">Apply changes</span>
          <span className="rounded-lg border border-[var(--mf-pub-border-strong)] px-2.5 py-1 text-mf-pub-text-secondary">Keep original</span>
        </p>
      </div>
    </div>
  );
}

function ProgressPreview() {
  // A fixed 12-week pattern, not data: rest days, a missed week, a steady block.
  const weeks = Array.from({ length: 12 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => (w === 5 ? 0 : d === 2 || d === 6 ? 0 : (w * 7 + d * 3) % 5 === 0 ? 1 : w > 7 ? 3 : 2)),
  );
  const tone = ["bg-[var(--mf-pub-border)]", "bg-[var(--mf-brand-soft)]", "bg-mf-brand", "bg-mf-pub-text"];
  return (
    <div aria-hidden="true" className={cn(card, "p-4 sm:p-5")}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-heading text-xl font-black uppercase text-mf-pub-text">Last 12 weeks</p>
        <p className="text-xs text-mf-pub-text-muted">Consistency</p>
      </div>
      <div className="mt-4 grid grid-flow-col grid-cols-12 grid-rows-7 gap-1">
        {weeks.flatMap((days, w) =>
          days.map((level, d) => <span key={`${w}-${d}`} className={cn("aspect-square rounded-[3px]", tone[level])} />),
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--mf-pub-border)] pt-3 text-xs">
        <div>
          <dt className="text-mf-pub-text-muted">Lifetime best</dt>
          <dd className="font-semibold tabular-nums text-mf-pub-text">Squat · 120 kg × 5</dd>
        </div>
        <div>
          <dt className="text-mf-pub-text-muted">Then vs now</dt>
          <dd className="font-semibold tabular-nums text-mf-pub-text">Bench · 70 → 80 kg</dd>
        </div>
      </dl>
    </div>
  );
}

/* ---------- Muscle Intelligence: real component + real engine ---------- */

const bench = findCatalogueExercise({ slug: "barbell-bench-press" });

function benchHighlights(): MuscleMapHighlights {
  const out: MuscleMapHighlights = {};
  if (!bench) return out;
  const groups: Array<[string[], MuscleInvolvement]> = [
    [bench.stabilizers ?? [], "stabilizer"],
    [bench.secondaryMuscles, "secondary"],
    [[bench.primaryMuscle], "primary"],
  ];
  for (const [names, role] of groups) {
    for (const name of names) {
      const muscle = resolveCanonicalMuscle(name);
      if (muscle) out[muscle] = role;
    }
  }
  return out;
}

function MuscleChapter() {
  const highlights = benchHighlights();
  const alternatives = bench ? findAlternatives({ current: bench, reasons: ["machine_occupied"] }).alternatives.slice(0, 3) : [];
  const roles: MuscleInvolvement[] = ["primary", "secondary", "stabilizer"];

  return (
    <article
      aria-labelledby="ch-muscle"
      className="rounded-[28px] border-2 border-mf-pub-text bg-mf-pub-surface p-5 sm:p-8 lg:p-10"
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
        <div>
          <p className={kicker}>03 · Muscle Intelligence &amp; Adaptive Workouts</p>
          <h3
            id="ch-muscle"
            className="mt-3 text-balance font-heading text-3xl font-black uppercase leading-[0.95] tracking-tight text-mf-pub-text sm:text-4xl"
          >
            Every lift, mapped to muscle.
          </h3>
          <p className="mt-4 max-w-[52ch] text-pretty text-base leading-7 text-mf-pub-text-secondary">
            Front and back anatomy maps show what an exercise trains — primary movers, secondary movers and
            stabilisers — using the same muscle names as your training analytics. Search a muscle to see the
            exercises that load it.
          </p>
          <p className="mt-4 max-w-[52ch] text-pretty text-base leading-7 text-mf-pub-text-secondary">
            Station taken or kit missing? Say why, and you get alternatives for the same target muscle, with what
            changes and how to pick a starting load. Available in the exercise library and, when your plan allows
            swaps, mid-session. An exercise you&apos;ve already logged sets on stays as it is.
          </p>
        </div>

        <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <figure className="min-w-0">
            <figcaption className="mb-2 text-xs font-medium text-mf-pub-text-muted">
              {bench?.name ?? "Bench press"} · from the exercise catalogue
            </figcaption>
            <MuscleMap highlights={highlights} legend={false} className="border-[var(--mf-pub-border-strong)] bg-mf-pub-bg" />
            <ul className="mt-3 space-y-1 text-xs text-mf-pub-text-secondary">
              {roles.map((role) => {
                const names = (Object.entries(highlights) as Array<[keyof typeof MUSCLE_DISPLAY_NAME, MuscleInvolvement]>)
                  .filter(([, r]) => r === role)
                  .map(([m]) => MUSCLE_DISPLAY_NAME[m]);
                return names.length ? (
                  <li key={role}>
                    <span className="font-semibold capitalize text-mf-pub-text">{role}</span> · {names.join(", ")}
                  </li>
                ) : null;
              })}
            </ul>
          </figure>

          {alternatives.length > 0 ? (
            <figure className="min-w-0">
              <figcaption className="mb-2 text-xs font-medium text-mf-pub-text-muted">
                Reason: machine occupied · engine output
              </figcaption>
              <ol className="space-y-2">
                {alternatives.map((alt, i) => (
                  <li key={alt.item.name} className={cn(card, "px-3.5 py-3")}>
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold leading-tight text-mf-pub-text">{alt.item.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-mf-pub-text-muted">{i + 1}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-mf-pub-text-muted">{alt.item.equipment}</p>
                  </li>
                ))}
              </ol>
            </figure>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/* ---------- the section ---------- */

export function FeatureChapters() {
  return (
    <div className="space-y-20 sm:space-y-28">
      <Chapter
        id="ch-today"
        index={1}
        label="Today"
        title="One screen for the whole day."
        body={
          <>
            Your check-in, the session your plan scheduled, calories and protein against target, and a short list
            of what matters now. When something can&apos;t be read, Today says it&apos;s unavailable instead of
            guessing.
          </>
        }
        points={[
          "Today's session with a start button",
          "A short list of what matters now",
          "Holds and unavailable data shown plainly, never smoothed over",
        ]}
        preview={<TodayPreview />}
      />
      <Chapter
        id="ch-train"
        index={2}
        label="Training · Iron Logbook"
        title="Every set, in ink."
        body={
          <>
            Plans schedule a session for each day. The player shows what you lifted last time, saves each set the
            moment you log it, runs a rest timer, and asks before you finish with sets still open.
          </>
        }
        points={["Last-time hints on every exercise", "Workout history, session by session", "Form Coach and SetVision for camera and video checks"]}
        preview={<LogbookPreview />}
        flip
      />
      <MuscleChapter />
      <Chapter
        id="ch-fuel"
        index={4}
        label="Nutrition · Dante"
        title="Seven ways in. One set of numbers."
        body={
          <>
            However food arrives, the server recalculates calories and macros from the portion you confirm, and
            estimates stay labelled as estimates. Dante reads your actual log and drafts meals — nothing
            is logged until you confirm it.
          </>
        }
        points={[
          "Daily calorie and macro targets from your plan",
          "Meal suggestions account for allergens you've disclosed",
          "Menu photo helps you choose an order; it logs nothing",
        ]}
        preview={<NutritionPreview />}
      />
      <Chapter
        id="ch-recover"
        index={5}
        label="Recovery"
        title="A score you can check."
        body={
          <>
            Six quick ratings and one question about pain or illness. Readiness comes from a fixed formula with a
            seven-day trend — Dante can explain it, never change it. Report pain or illness and training is held
            on Today, Training and Recovery until you clear it, and the hold is enforced on the server, not just
            hidden on screen.
          </>
        }
        points={["Check-in in under a minute", "Readiness score and seven-day trend", "Training hold for pain or illness"]}
        preview={<RecoveryPreview />}
        flip
      />
      <Chapter
        id="ch-dante"
        index={6}
        label="Dante"
        title="Dante starts from today."
        body={
          <>
            Before you type, Dante has a verified view of today: the check-in, the session, the food log and any
            hold. Safety checks run before any model call. Suggested changes to a session arrive as proposals —
            apply them or keep the original.
          </>
        }
        points={[
          "Conversations are saved — reopen any thread from History",
          "Start a new chat whenever the topic changes",
          "Reads the same numbers the app shows; never invents them",
        ]}
        preview={<DantePreview />}
      />
      <Chapter
        id="ch-progress"
        index={7}
        label="Progress & Calendar"
        title="The long view, kept honest."
        body={
          <>
            Twelve weeks of consistency, this week&apos;s rhythm, volume by muscle, lifetime bests and a
            then-versus-now comparison — all built from the sessions you actually logged.
          </>
        }
        points={["Consistency heatmap and muscle volume", "Lifetime bests and then vs now", "A calendar of each day's plan and status"]}
        preview={<ProgressPreview />}
        flip
      />
    </div>
  );
}
