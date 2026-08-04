import Link from "next/link";

const tree = `muscle-fitness/
├── data/                          # runtime DB local (gitignore)
├── supabase/
│   └── migrations/
│       └── 20260804141000_project_09_workout_system.sql
├── docs/
│   └── PROJECT_09_WORKOUT_SYSTEM.md
└── src/
    ├── proxy.ts
    ├── app/
    │   ├── docs/workout-system/page.tsx
    │   ├── api/{exercises,plans,sessions,progress}/...
    │   └── dashboard/
    │       ├── workouts/page.tsx      # Open workout
    │       ├── plans/[id]/page.tsx    # Plan builder
    │       ├── exercises/page.tsx     # Exercise library
    │       ├── workout/[id]/page.tsx  # Workout player
    │       ├── history/page.tsx
    │       └── progress/page.tsx
    └── features/
        └── workout/
            ├── schema.ts
            ├── types.ts
            ├── calculations.ts
            ├── seed.ts
            ├── store.ts
            ├── actions.ts
            ├── exercise-library.tsx
            ├── plan-builder.tsx
            ├── workout-player.tsx
            └── rest-timer.tsx`;

const checklist = [
  { step: "Open workout", href: "/dashboard/workouts" },
  { step: "Log every set", href: "/dashboard/workouts" },
  { step: "Complete workout", href: "/dashboard/workouts" },
  { step: "Save database", href: "/dashboard/history" },
  { step: "View history", href: "/dashboard/history" },
  { step: "Next-session recommendation", href: "/dashboard/history" },
];

export default function WorkoutSystemDocsPage() {
  return (
    <div className="min-h-screen bg-ink text-bone">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <Link href="/dashboard" className="text-sm text-lime hover:underline">
          ← Dashboard
        </Link>

        <p className="mt-8 text-xs uppercase tracking-[0.2em] text-lime">
          Muscle Fitness
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-wide sm:text-5xl">
          Dự án 09 — Workout system
        </h1>
        <p className="mt-4 text-bone/70">
          Hướng dẫn từng phần: cấu trúc file, library, plan builder, player,
          progression, lưu DB và checklist hoàn thành.
        </p>

        <section className="mt-12">
          <h2 className="font-display text-2xl tracking-wide text-lime">
            1. Tổng quan
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-bone/85">
            <li>Exercise library — metadata bài tập đầy đủ</li>
            <li>Plan builder — ngày, sets, RIR/RPE, tempo, kéo thả</li>
            <li>Workout player — log set + rest timer + finish</li>
            <li>Progression — volume, PR, e1RM, recommendation, deload</li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl tracking-wide text-lime">
            2. Cấu trúc cần đặt vào project
          </h2>
          <pre className="mt-4 overflow-x-auto border border-bone/15 bg-graphite p-4 text-xs leading-relaxed text-bone/90 sm:text-sm">
            {tree}
          </pre>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl tracking-wide text-lime">
            3. Chạy nhanh
          </h2>
          <pre className="mt-4 overflow-x-auto border border-bone/15 bg-graphite p-4 text-sm text-bone/90">
            {`npm install
npm run dev
# → http://localhost:3000/dashboard`}
          </pre>
          <p className="mt-3 text-sm text-bone/70">
            Dữ liệu demo ghi vào <code className="text-lime">data/workout-db.json</code>.
            Schema Supabase:{" "}
            <code className="text-lime">
              supabase/migrations/20260804141000_project_09_workout_system.sql
            </code>
            .
          </p>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl tracking-wide text-lime">
            4–7. Các màn hình
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ["Exercise library", "/dashboard/exercises"],
              ["Plan builder", "/dashboard/plans"],
              ["Open / play workout", "/dashboard/workouts"],
              ["History", "/dashboard/history"],
              ["Progression", "/dashboard/progress"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="border border-bone/20 px-4 py-3 text-sm hover:border-lime hover:text-lime"
              >
                {label} →
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl tracking-wide text-lime">
            8. Checklist hoàn thành (DoD)
          </h2>
          <ol className="mt-4 space-y-3">
            {checklist.map((item, index) => (
              <li
                key={item.step}
                className="flex items-center justify-between gap-3 border-t border-bone/15 pt-3 text-sm"
              >
                <span>
                  <span className="text-lime">0{index + 1}.</span> {item.step}
                </span>
                <Link href={item.href} className="text-bone/60 hover:text-lime">
                  Mở
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12 border-t border-bone/15 pt-8 text-sm text-bone/60">
          File markdown đầy đủ:{" "}
          <code className="text-lime">docs/PROJECT_09_WORKOUT_SYSTEM.md</code>
        </section>
      </div>
    </div>
  );
}
