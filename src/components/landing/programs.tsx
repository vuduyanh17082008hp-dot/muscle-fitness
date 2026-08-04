"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { workouts } from "@/lib/data";

export function Programs() {
  return (
    <section id="programs" className="bg-mist px-5 py-24 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-4xl tracking-[0.04em] text-ink sm:text-5xl">
              Programs
            </p>
            <p className="mt-3 max-w-md text-steel">
              Focused sessions built for strength, recovery, and measurable output.
            </p>
          </div>
          <Link
            href="/dashboard/workouts"
            className="text-sm font-semibold text-ink underline decoration-lime decoration-2 underline-offset-4"
          >
            Browse in app
          </Link>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {workouts.map((workout, index) => (
            <motion.article
              key={workout.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.55,
                delay: index * 0.06,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="border border-ink/10 bg-bone p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-xl font-semibold text-ink">{workout.title}</h3>
                <span className="text-xs uppercase tracking-wider text-steel">
                  {workout.durationMin} min
                </span>
              </div>
              <p className="mt-2 text-sm text-steel">{workout.focus}</p>
              <p className="mt-4 text-xs font-medium uppercase tracking-[0.14em] text-lime-deep">
                {workout.difficulty}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
