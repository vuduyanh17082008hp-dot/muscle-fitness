"use client";

import { motion } from "framer-motion";

const pillars = [
  {
    title: "Programmed progression",
    copy: "Weekly volume and intensity shift with your logged performance — not guesswork.",
  },
  {
    title: "Form in the loop",
    copy: "Webcam pose checks catch bar path and joint angles before bad habits stick.",
  },
  {
    title: "Coach on demand",
    copy: "Ask for swaps, deloads, or session tweaks and get answers grounded in your plan.",
  },
];

export function Method() {
  return (
    <section id="method" className="bg-bone px-5 py-24 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="font-display text-4xl tracking-[0.04em] text-ink sm:text-5xl">
          The method
        </p>
        <p className="mt-3 max-w-lg text-steel">
          One system. Three feedback loops. Less noise between you and the next PR.
        </p>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {pillars.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{
                duration: 0.6,
                delay: index * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="border-t border-ink/15 pt-6"
            >
              <span className="font-display text-3xl text-lime-deep">
                0{index + 1}
              </span>
              <h2 className="mt-4 text-xl font-semibold text-ink">{item.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-steel">{item.copy}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
